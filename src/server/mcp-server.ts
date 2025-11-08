import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import crypto from 'crypto';
import pino from 'pino';
import { WebSocketServer, WebSocket } from 'ws';
import type { BedrockConfig, CognitoConfig, DynamoTableConfig } from '../config/env';
import { runChatTurn } from '../ai/orchestrator';
import { createCognitoVerifier, type VerifiedUser } from './auth';
import { toolDefinitions, toolRegistry } from '../tools';
import { createChatHistoryStore } from './chat-history';

const logger = pino({ name: 'mcp-server', level: 'info' });

interface ServerOptions {
  host: string;
  port: number;
  cognito: CognitoConfig;
  bedrock: BedrockConfig;
  chatTable: DynamoTableConfig;
}

interface McpRequestBase {
  type: string;
  requestId?: string;
}

interface ListToolsRequest extends McpRequestBase {
  type: 'list_tools';
}

interface CallToolRequest extends McpRequestBase {
  type: 'call_tool';
  toolName: string;
  arguments?: Record<string, unknown>;
}

interface PingRequest extends McpRequestBase {
  type: 'ping';
}

type McpRequest = ListToolsRequest | CallToolRequest | PingRequest | McpRequestBase;

interface AuthenticatedUser {
  sub: string;
  email?: string;
}

function applyCors(req: IncomingMessage | undefined, res: ServerResponse) {
  const requestOrigin = req?.headers?.origin;
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  const requestHeaders = typeof req?.headers?.['access-control-request-headers'] === 'string'
    ? req.headers['access-control-request-headers']
    : null;
  if (requestHeaders) {
    res.setHeader('Access-Control-Allow-Headers', requestHeaders);
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function sendErrorJson(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 1_000_000) {
      throw new Error('Request body too large.');
    }
    chunks.push(buffer);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw);
}

function sendHelloMessage(socket: WebSocket) {
  const message = {
    type: 'hello',
    protocol: 1,
    serverInfo: {
      name: 'nexusnote-mcp-server',
      version: '0.1.0',
      description: 'Anthropic MCP-compatible server providing debate search tools.',
    },
  };

  socket.send(JSON.stringify(message));
}

function sendError(socket: WebSocket, request: McpRequest, error: Error | string) {
  const errMsg = typeof error === 'string' ? error : error.message;
  const payload = {
    type: 'error',
    requestId: request.requestId,
    error: errMsg,
  };
  socket.send(JSON.stringify(payload));
}

function sendListToolsResult(socket: WebSocket, request: ListToolsRequest) {
  const payload = {
    type: 'list_tools_result',
    requestId: request.requestId,
    tools: toolDefinitions,
  };
  socket.send(JSON.stringify(payload));
}

async function handleCallTool(socket: WebSocket, request: CallToolRequest) {
  const entry = toolRegistry[request.toolName];
  if (!entry) {
    sendError(socket, request, `Unknown tool: ${request.toolName}`);
    return;
  }

  try {
    const result = await entry.handler(request.arguments ?? {}, {
      logger,
    });
    socket.send(
      JSON.stringify({
        type: 'call_tool_result',
        requestId: request.requestId,
        toolName: request.toolName,
        content: result.content,
      })
    );
  } catch (error) {
    logger.error({ err: error, tool: request.toolName }, 'Tool execution failed');
    sendError(socket, request, error instanceof Error ? error : String(error));
  }
}

function handlePing(socket: WebSocket, request: PingRequest) {
  socket.send(
    JSON.stringify({
      type: 'pong',
      requestId: request.requestId,
    })
  );
}

function parseMessage(data: Buffer): McpRequest | null {
  try {
    const raw = JSON.parse(data.toString());
    if (!raw.type) {
      throw new Error('Missing type');
    }

    if (!raw.requestId) {
      raw.requestId = crypto.randomUUID();
    }

    return raw as McpRequest;
  } catch (error) {
    logger.error({ err: error }, 'Failed to parse MCP request');
    return null;
  }
}

function createChatHandler(
  bedrock: BedrockConfig,
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<AuthenticatedUser | null>,
  chatStore: ReturnType<typeof createChatHistoryStore>
) {
  return async function handleChat(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') {
      sendErrorJson(res, 405, 'Method not allowed');
      return;
    }

    const requester = await authenticate(req, res);
    if (!requester) {
      return;
    }
    logger.info({ user: requester.sub }, 'Authenticated chat request');

    let body: any;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to read request body');
      sendErrorJson(res, 400, 'Invalid JSON payload');
      return;
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      sendErrorJson(res, 400, 'message is required');
      return;
    }
    logger.info({ user: requester.sub, messagePreview: message.slice(0, 120) }, 'Parsed chat message body');

    const sessionIdRaw = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const sessionId = sessionIdRaw.length > 0 ? sessionIdRaw : `${requester.sub}#${crypto.randomUUID()}`;
    const messageId =
      typeof body?.messageId === 'string' && body.messageId.trim().length > 0
        ? body.messageId.trim()
        : crypto.randomUUID();

    logger.info({ user: requester.sub }, 'Received chat turn');

    try {
      const existingMessages = await chatStore.listMessages(sessionId, 200);
      const unauthorized = existingMessages.some((item) => item.userId !== requester.sub);
      if (unauthorized) {
        sendErrorJson(res, 403, 'You do not have access to this conversation.');
        return;
      }
      logger.info({ user: requester.sub, sessionId, existingMessages: existingMessages.length }, 'Loaded existing conversation history');

      const isFirstMessage = existingMessages.length === 0;

      const userMessageTimestamp = new Date().toISOString();

      await chatStore.putMessage({
        sessionId,
        createdAt: userMessageTimestamp,
        messageId,
        role: 'user',
        content: message,
        userId: requester.sub,
      });
      logger.info({ user: requester.sub, sessionId, messageId, timestamp: userMessageTimestamp }, 'Stored user message');

      await chatStore.upsertSummary({
        sessionId,
        userId: requester.sub,
        lastMessageAt: userMessageTimestamp,
        lastRole: 'user',
        lastMessagePreview: buildMessagePreview(message),
        title: isFirstMessage ? buildSessionTitle(message) : undefined,
      });
      logger.info({ user: requester.sub, sessionId }, 'Updated session summary after user message');

      const historyForModel = existingMessages
        .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
        .map((entry) => ({
          role: entry.role as 'user' | 'assistant',
          content: entry.content,
        }));

      const result = await runChatTurn({
        userMessage: message,
        history: historyForModel,
        bedrock,
        toolDefinitions,
        toolRegistry,
        logger,
        currentUserId: requester.sub,
      });
      logger.info({ user: requester.sub, sessionId, toolCalls: result.toolCalls }, 'runChatTurn completed');

      const assistantReply =
        typeof result.reply === 'string' ? result.reply : JSON.stringify(result.reply, null, 2);

      let assistantMessageTimestamp = new Date().toISOString();
      if (assistantMessageTimestamp <= userMessageTimestamp) {
        assistantMessageTimestamp = new Date(Date.parse(userMessageTimestamp) + 1).toISOString();
      }

      await chatStore.putMessage({
        sessionId,
        createdAt: assistantMessageTimestamp,
        messageId: crypto.randomUUID(),
        role: 'assistant',
        content: assistantReply,
        userId: requester.sub,
        metadata: {
          toolCalls: result.toolCalls,
          rawReply: result.reply,
        },
      });
      logger.info({ user: requester.sub, sessionId, timestamp: assistantMessageTimestamp }, 'Stored assistant reply');

      await chatStore.upsertSummary({
        sessionId,
        userId: requester.sub,
        lastMessageAt: assistantMessageTimestamp,
        lastRole: 'assistant',
        lastMessagePreview: buildMessagePreview(assistantReply),
      });
      logger.info({ user: requester.sub, sessionId }, 'Updated session summary after assistant reply');

      sendJson(res, 200, {
        sessionId,
        reply: result.reply,
        toolCalls: result.toolCalls,
      });
      logger.info({ user: requester.sub, sessionId }, 'Sent chat response to client');
    } catch (error) {
      logger.error({ err: error }, 'Chat orchestrator failed');
      sendErrorJson(res, 500, 'Failed to process chat request');
    }
  };
}

export function createMcpServer(options: ServerOptions) {
  const { host, port, cognito, bedrock, chatTable } = options;
  const verifyToken = createCognitoVerifier(cognito);
  const chatHistoryStore = createChatHistoryStore(chatTable);
  const authenticate = createAuthenticator(verifyToken);
  const chatHandler = createChatHandler(bedrock, authenticate, chatHistoryStore);

  const httpServer = createServer(async (req, res) => {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const path = requestUrl.pathname;

    if (req.method === 'GET' && path.startsWith('/health')) {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'POST' && path === '/chat') {
      await chatHandler(req, res);
      return;
    }

    if (req.method === 'GET' && path === '/conversations') {
      const requester = await authenticate(req, res);
      if (!requester) {
        return;
      }

      try {
        const conversations = await chatHistoryStore.listSummariesForUser(requester.sub);
        sendJson(res, 200, { conversations });
      } catch (error) {
        logger.error({ err: error, user: requester.sub }, 'Failed to list conversations');
        sendErrorJson(res, 500, 'Failed to load conversations');
      }
      return;
    }

    const deleteConversationMatch = path.match(/^\/conversations\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteConversationMatch) {
      const sessionId = decodeURIComponent(deleteConversationMatch[1]);
      const requester = await authenticate(req, res);
      if (!requester) {
        return;
      }

      try {
        await chatHistoryStore.deleteConversation(sessionId, requester.sub);
        res.writeHead(204);
        res.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete conversation';
        if (message === 'Conversation not found.') {
          sendErrorJson(res, 404, 'Conversation not found.');
          return;
        }
        if (message === 'You do not have access to this conversation.') {
          sendErrorJson(res, 403, 'You do not have access to this conversation.');
          return;
        }
        logger.error({ err: error, user: requester.sub, sessionId }, 'Failed to delete conversation');
        sendErrorJson(res, 500, 'Failed to delete conversation');
      }
      return;
    }

    const messagesMatch = path.match(/^\/conversations\/([^/]+)\/messages$/);
    if (req.method === 'GET' && messagesMatch) {
      const sessionId = decodeURIComponent(messagesMatch[1]);
      const requester = await authenticate(req, res);
      if (!requester) {
        return;
      }

      const limitParam = requestUrl.searchParams.get('limit');
      const limit = limitParam ? clampLimit(limitParam) : undefined;

      try {
        const summary = await chatHistoryStore.getSummary(sessionId);
        if (summary && summary.userId !== requester.sub) {
          sendErrorJson(res, 403, 'You do not have access to this conversation.');
          return;
        }

        const messages = await chatHistoryStore.listMessages(sessionId, limit);
        if (!summary && messages.length === 0) {
          sendErrorJson(res, 404, 'Conversation not found');
          return;
        }

        const unauthorized = messages.some((message) => message.userId !== requester.sub);
        if (unauthorized) {
          sendErrorJson(res, 403, 'You do not have access to this conversation.');
          return;
        }

        sendJson(res, 200, {
          sessionId,
          messages,
          summary: summary ?? null,
        });
      } catch (error) {
        logger.error({ err: error, user: requester.sub, sessionId }, 'Failed to load conversation messages');
        sendErrorJson(res, 500, 'Failed to load messages');
      }
      return;
    }

    if (!res.writableEnded) {
      sendErrorJson(res, 404, 'Not found');
    }
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket: WebSocket) => {
    logger.info('Client connected to MCP server');
    sendHelloMessage(socket);

    socket.on('message', async (data: Buffer) => {
      const request = parseMessage(data);
      if (!request) {
        return;
      }

      switch (request.type) {
        case 'list_tools':
          sendListToolsResult(socket, request as ListToolsRequest);
          break;
        case 'call_tool':
          await handleCallTool(socket, request as CallToolRequest);
          break;
        case 'ping':
          handlePing(socket, request as PingRequest);
          break;
        default:
          sendError(socket, request, `Unsupported request type: ${request.type}`);
      }
    });

    socket.on('close', () => {
      logger.info('Client disconnected from MCP server');
    });
  });

  function start() {
    httpServer.listen(port, host, () => {
      logger.info({ host, port }, 'MCP server listening for connections');
    });
  }

  return { start };
}

function getAuthorizationHeader(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (!header) {
    return null;
  }
  return Array.isArray(header) ? header[0] : header;
}

function extractBearerToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const prefix = /^bearer\s+/i;
  if (prefix.test(trimmed)) {
    return trimmed.replace(prefix, '').trim();
  }

  return null;
}

function createAuthenticator(
  verifyToken: (token: string) => Promise<VerifiedUser>
): (req: IncomingMessage, res: ServerResponse) => Promise<AuthenticatedUser | null> {
  return async function authenticate(req, res) {
    const header = getAuthorizationHeader(req);
    const token = extractBearerToken(header);

    if (!token) {
      sendErrorJson(res, 401, 'Missing or invalid Authorization header.');
      return null;
    }

    try {
      const verified = await verifyToken(token);
      return {
        sub: verified.sub,
        email: verified.email,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Token verification failed');
      sendErrorJson(res, 401, 'Invalid or expired token.');
      return null;
    }
  };
}

function buildMessagePreview(text: string, maxLength = 180): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const sliceLength = Math.max(0, maxLength - 3);
  return `${trimmed.slice(0, sliceLength).trimEnd()}...`;
}

function buildSessionTitle(text: string): string {
  const preview = buildMessagePreview(text, 80);
  if (!preview) {
    return 'New chat';
  }
  return preview;
}

function clampLimit(raw: string): number | undefined {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(Math.floor(parsed), 500);
}
