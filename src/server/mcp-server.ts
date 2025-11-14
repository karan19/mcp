import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import crypto from 'crypto';
import pino, { type Logger } from 'pino';
import { WebSocketServer, WebSocket } from 'ws';
import type { BedrockConfig, CognitoConfig, DynamoTableConfig } from '../config/env';
import { runChatTurnWithEvents, type RunChatTurnEvents, type RunChatTurnResult } from '../ai/orchestrator';
import { createCognitoVerifier, type VerifiedUser } from './auth';
import { toolDefinitions, toolRegistry } from '../tools';
import { createChatHistoryStore } from './chat-history';
import { renderPrometheusMetrics } from '../metrics/toolMetrics';
import { invokeModel } from '../ai/bedrock';

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

/**
 * Lightweight error subclass used to propagate HTTP status codes from deep in
 * the chat workflow back to the request handlers.
 */
class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

type ChatWorkflowContext = {
  bedrock: BedrockConfig;
  chatStore: ReturnType<typeof createChatHistoryStore>;
  logger: Logger;
  toolDefinitions: typeof toolDefinitions;
  toolRegistry: typeof toolRegistry;
};

type ChatStatusStage =
  | 'history_loading'
  | 'history_loaded'
  | 'user_message_stored'
  | 'model_inference'
  | 'assistant_reply_ready'
  | 'assistant_message_stored';

interface ChatWorkflowHooks {
  onStatus?: (stage: ChatStatusStage, details?: Record<string, unknown>) => void;
  runEvents?: RunChatTurnEvents;
  streaming?: {
    enabled: boolean;
    onAssistantDelta?: (text: string) => void;
    abortSignal?: AbortSignal;
    onComplete?: () => void;
  };
}

interface ChatIdentifiers {
  sessionId: string;
  messageId: string;
}

/**
 * Applies permissive CORS headers so the MCP UI can call into the server from
 * any origin during local development.
 */
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

/**
 * Serialises `payload` as JSON, writes it with the supplied status code, and
 * handles the common headers needed by most routes.
 */
function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

/**
 * Convenience wrapper that standardises the shape of JSON error responses.
 */
function sendErrorJson(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

/**
 * Reads and parses the JSON payload from a request, enforcing a small size
 * limit to guard against accidental large uploads.
 */
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

/**
 * Sends the initial hello message defined by the MCP protocol when a websocket
 * connection is established.
 */
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

/**
 * Sends a well-formed MCP error payload back over the websocket connection.
 */
function sendError(socket: WebSocket, request: McpRequest, error: Error | string) {
  const errMsg = typeof error === 'string' ? error : error.message;
  const payload = {
    type: 'error',
    requestId: request.requestId,
    error: errMsg,
  };
  socket.send(JSON.stringify(payload));
}

/**
 * Serialises the local tool catalogue into the MCP `list_tools_result` payload.
 */
function sendListToolsResult(socket: WebSocket, request: ListToolsRequest) {
  const payload = {
    type: 'list_tools_result',
    requestId: request.requestId,
    tools: toolDefinitions,
  };
  socket.send(JSON.stringify(payload));
}

/**
 * Handles `call_tool` MCP requests by delegating to the local registry and
 * piping the result back across the websocket connection.
 */
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

/**
 * Simple ping/pong handler that keeps clients aware the connection is alive.
 */
function handlePing(socket: WebSocket, request: PingRequest) {
  socket.send(
    JSON.stringify({
      type: 'pong',
      requestId: request.requestId,
    })
  );
}

/**
 * Parses websocket frames into strongly typed MCP requests. Any parse errors
 * are logged and surfaced to the caller as null so the frame can be ignored.
 */
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

/**
 * Creates the synchronous chat HTTP handler. The returned function validates
 * authentication, persists the user message, orchestrates the model call, and
 * finally stores the assistant reply before responding.
 */
function createChatHandler(
  context: ChatWorkflowContext,
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<AuthenticatedUser | null>
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

    const identifiers = resolveChatIdentifiers(
      requester.sub,
      typeof body?.sessionId === 'string' ? body.sessionId : undefined,
      typeof body?.messageId === 'string' ? body.messageId : undefined
    );

    logger.info({ user: requester.sub, sessionId: identifiers.sessionId }, 'Received chat turn');

    try {
      const result = await processChatRequest(
        context,
        {
          requester,
          message,
          identifiers,
        },
        undefined
      );

      sendJson(res, 200, {
        sessionId: result.sessionId,
        reply: result.reply,
        toolCalls: result.toolCalls,
      });
      logger.info({ user: requester.sub, sessionId: result.sessionId }, 'Sent chat response to client');
    } catch (error) {
      if (error instanceof RequestError) {
        sendErrorJson(res, error.status, error.message);
        return;
      }
      logger.error({ err: error }, 'Chat orchestrator failed');
      sendErrorJson(res, 500, 'Failed to process chat request');
    }
  };
}

/**
 * Creates the streaming chat HTTP handler. This version pipes incremental
 * status updates and assistant deltas to the client using Server-Sent Events.
 */
function createChatStreamHandler(
  context: ChatWorkflowContext,
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<AuthenticatedUser | null>
) {
  return async function handleChatStream(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') {
      sendErrorJson(res, 405, 'Method not allowed');
      return;
    }

    const requester = await authenticate(req, res);
    if (!requester) {
      return;
    }
    logger.info({ user: requester.sub }, 'Authenticated streaming chat request');

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

    const identifiers = resolveChatIdentifiers(
      requester.sub,
      typeof body?.sessionId === 'string' ? body.sessionId : undefined,
      typeof body?.messageId === 'string' ? body.messageId : undefined
    );

    const upstreamAbort = new AbortController();
    const channel = createSseChannel(req, res, () => {
      upstreamAbort.abort();
    });
    channel.send('ack', {
      sessionId: identifiers.sessionId,
      messageId: identifiers.messageId,
    });

    const hooks: ChatWorkflowHooks = {
      onStatus(stage, details) {
        channel.send('status', { stage, ...details });
      },
      runEvents: {
        onDecision(decision) {
          channel.send('decision', decision);
        },
        onToolInvocationStart(toolName, args) {
          channel.send('tool_call', {
            stage: 'start',
            toolName,
            arguments: args ?? {},
          });
        },
        onToolInvocationComplete(toolName, output) {
          channel.send('tool_call', {
            stage: 'complete',
            toolName,
            output,
          });
        },
      },
      streaming: {
        enabled: true,
        onAssistantDelta(text) {
          if (typeof text === 'string' && text.length > 0) {
            channel.send('assistant_delta', {
              sessionId: identifiers.sessionId,
              text,
            });
          }
        },
        abortSignal: upstreamAbort.signal,
        onComplete() {
          channel.send('done', { sessionId: identifiers.sessionId });
          channel.close();
        },
      },
    };

    try {
      const result = await processChatRequest(
        context,
        {
          requester,
          message,
          identifiers,
        },
        hooks
      );

      channel.send('assistant_message', {
        sessionId: result.sessionId,
        content: result.assistantText,
        reply: result.reply,
        toolCalls: result.toolCalls,
        messageId: result.assistantMessageId,
        createdAt: result.assistantMessageAt,
      });
      hooks.streaming?.onComplete?.();
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        logger.info({ user: requester.sub, sessionId: identifiers.sessionId }, 'Streaming chat aborted by client');
        channel.close();
        return;
      }
      if (error instanceof RequestError) {
        channel.send('error', { status: error.status, message: error.message });
      } else {
        logger.error({ err: error }, 'Streaming chat orchestrator failed');
        channel.send('error', { status: 500, message: 'Failed to process chat request' });
      }
      channel.close();
    }
  };
}
/**
 * Constructs the MCP HTTP and websocket server. Most dependencies are injected
 * via `options` so the surrounding code can unit test individual pieces.
 */
export function createMcpServer(options: ServerOptions) {
  const { host, port, cognito, bedrock, chatTable } = options;
  const verifyToken = createCognitoVerifier(cognito);
  const chatHistoryStore = createChatHistoryStore(chatTable);
  const authenticate = createAuthenticator(verifyToken);
  const workflowContext: ChatWorkflowContext = {
    bedrock,
    chatStore: chatHistoryStore,
    logger,
    toolDefinitions,
    toolRegistry,
  };
  const chatHandler = createChatHandler(workflowContext, authenticate);
  const chatStreamHandler = createChatStreamHandler(workflowContext, authenticate);

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

    if (req.method === 'GET' && path === '/metrics') {
      const body = renderPrometheusMetrics();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.end(body);
      return;
    }

    if (req.method === 'POST' && path === '/chat') {
      await chatHandler(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/chat/stream') {
      await chatStreamHandler(req, res);
      return;
    }

    if (req.method === 'GET' && path === '/conversations/search') {
      const requester = await authenticate(req, res);
      if (!requester) {
        return;
      }

      const queryParam = requestUrl.searchParams.get('query') ?? requestUrl.searchParams.get('q') ?? '';
      const trimmedQuery = queryParam.trim();
      if (!trimmedQuery) {
        sendErrorJson(res, 400, 'query is required');
        return;
      }

      const limitParam = requestUrl.searchParams.get('limit');
      const limit = limitParam ? clampSearchLimit(limitParam) : 20;

      try {
        const [matches, summaries] = await Promise.all([
          chatHistoryStore.searchMessagesForUser(requester.sub, trimmedQuery, limit),
          chatHistoryStore.listSummariesForUser(requester.sub),
        ]);
        const summaryMap = new Map(summaries.map((summary) => [summary.sessionId, summary]));
        const payload = matches.map((match) => {
          const summary = summaryMap.get(match.sessionId);
          return {
            sessionId: match.sessionId,
            messageId: match.messageId,
            content: match.content,
            snippet: buildSearchSnippet(match.content, trimmedQuery),
            createdAt: match.createdAt,
            role: match.role,
            title: summary?.title ?? summary?.lastMessagePreview ?? 'Untitled conversation',
          };
        });
        sendJson(res, 200, { matches: payload });
      } catch (error) {
        logger.error({ err: error, user: requester.sub }, 'Failed to search conversations');
        sendErrorJson(res, 500, 'Failed to search conversations');
      }
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

/**
 * Normalises the `Authorization` header name casing coming from Node's HTTP
 * server and returns the first value when multiple headers are present.
 */
function getAuthorizationHeader(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (!header) {
    return null;
  }
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Extracts the bearer token from a raw `Authorization` header value.
 */
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

/**
 * Wraps the Cognito verifier with request/response handling so route handlers
 * can authenticate requests with a single call.
 */
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

/**
 * Resolves the effective session and message identifiers, generating stable
 * defaults when callers omit them.
 */
function resolveChatIdentifiers(userSub: string, sessionIdRaw?: string, messageIdRaw?: string): ChatIdentifiers {
  const sessionInput = sessionIdRaw?.trim() ?? '';
  const messageInput = messageIdRaw?.trim() ?? '';

  const sessionId = sessionInput.length > 0 ? sessionInput : `${userSub}#${crypto.randomUUID()}`;
  const messageId = messageInput.length > 0 ? messageInput : crypto.randomUUID();

  return {
    sessionId,
    messageId,
  };
}

interface ChatRequestPayload {
  requester: AuthenticatedUser;
  message: string;
  identifiers: ChatIdentifiers;
}

interface ChatProcessingResult {
  sessionId: string;
  reply: RunChatTurnResult['reply'];
  assistantText: string;
  toolCalls: RunChatTurnResult['toolCalls'];
  assistantMessageId: string;
  assistantMessageAt: string;
}

/**
 * Shared implementation that powers both the synchronous and streaming chat
 * endpoints. The function persists the user message, orchestrates tool calls,
 * stores the assistant response, and updates the conversation summary.
 */
async function processChatRequest(
  context: ChatWorkflowContext,
  payload: ChatRequestPayload,
  hooks?: ChatWorkflowHooks
): Promise<ChatProcessingResult> {
  const { chatStore, bedrock, logger, toolDefinitions, toolRegistry } = context;
  const { requester, message, identifiers } = payload;
  const { sessionId, messageId } = identifiers;

  hooks?.onStatus?.('history_loading');
  const existingMessages = await chatStore.listMessages(sessionId, 200);
  hooks?.onStatus?.('history_loaded', { count: existingMessages.length });

  const unauthorized = existingMessages.some((item) => item.userId !== requester.sub);
  if (unauthorized) {
    throw new RequestError(403, 'You do not have access to this conversation.');
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
  hooks?.onStatus?.('user_message_stored', { messageId });
  logger.info({ user: requester.sub, sessionId, messageId, timestamp: userMessageTimestamp }, 'Stored user message');

  await chatStore.upsertSummary({
    sessionId,
    userId: requester.sub,
    lastMessageAt: userMessageTimestamp,
    lastRole: 'user',
    lastMessagePreview: buildMessagePreview(message),
    title: isFirstMessage ? buildSessionTitle(message) : undefined,
  });

  const historyForModel = existingMessages
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: entry.content,
    }));

  hooks?.onStatus?.('model_inference');
  const result = await runChatTurnWithEvents(
    {
      userMessage: message,
      history: historyForModel,
      bedrock,
      toolDefinitions,
      toolRegistry,
      logger,
      currentUserId: requester.sub,
    },
    hooks?.runEvents,
    hooks?.streaming
  );
  hooks?.onStatus?.('assistant_reply_ready');
  logger.info({ user: requester.sub, sessionId, toolCalls: result.toolCalls }, 'runChatTurn completed');

  const assistantReply = typeof result.reply === 'string' ? result.reply : JSON.stringify(result.reply, null, 2);

  let assistantMessageTimestamp = new Date().toISOString();
  if (assistantMessageTimestamp <= userMessageTimestamp) {
    assistantMessageTimestamp = new Date(Date.parse(userMessageTimestamp) + 1).toISOString();
  }
  const assistantMessageId = crypto.randomUUID();

  await chatStore.putMessage({
    sessionId,
    createdAt: assistantMessageTimestamp,
    messageId: assistantMessageId,
    role: 'assistant',
    content: assistantReply,
    userId: requester.sub,
    metadata: {
      toolCalls: result.toolCalls,
      rawReply: result.reply,
    },
  });
  hooks?.onStatus?.('assistant_message_stored', { messageId: assistantMessageId });
  logger.info({ user: requester.sub, sessionId, timestamp: assistantMessageTimestamp }, 'Stored assistant reply');

  const summary = await safeGenerateSummary(bedrock, {
    titleSeed: isFirstMessage ? message : undefined,
    assistantReply,
    history: historyForModel,
    logger,
  });

  await chatStore.upsertSummary({
    sessionId,
    userId: requester.sub,
    lastMessageAt: assistantMessageTimestamp,
    lastRole: 'assistant',
    lastMessagePreview: buildMessagePreview(assistantReply),
    title: summary?.title,
  });

  return {
    sessionId,
    reply: result.reply,
    assistantText: assistantReply,
    toolCalls: result.toolCalls,
    assistantMessageId,
    assistantMessageAt: assistantMessageTimestamp,
  };
}

/**
 * Normalises whitespace and truncates chat messages for summary displays.
 */
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

/**
 * Generates a sensible default conversation title from the first user message.
 */
function buildSessionTitle(text: string): string {
  const preview = buildMessagePreview(text, 80);
  if (!preview) {
    return 'New chat';
  }
  return preview;
}

/**
 * Attempts to generate a short conversational title using Bedrock. Failures are
 * swallowed because summaries are a best-effort enhancement.
 */
async function safeGenerateSummary(
  bedrock: BedrockConfig,
  options: {
    titleSeed?: string;
    assistantReply: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    logger: Logger;
  }
): Promise<{ title?: string } | null> {
  try {
    const promptParts: string[] = [];
    promptParts.push('Conversation so far:');
    for (const entry of options.history.slice(-5)) {
      const speaker = entry.role === 'assistant' ? 'Assistant' : 'User';
      promptParts.push(`${speaker}: ${entry.content}`);
    }
    promptParts.push('Assistant:', options.assistantReply);
    promptParts.push(
      '',
      'Please provide a short (max 12 words) title summarizing this conversation turn.',
      'Respond only with the title text.'
    );

    const summaryText = await invokeModel(bedrock, {
      messages: [
        { role: 'system', content: 'You write concise titles for chat conversations.' },
        { role: 'user', content: promptParts.join('\n') },
      ],
      maxOutputTokens: 64,
      temperature: 0.3,
    });
    const title = summaryText.split('\n')[0].trim().replace(/^"|"$/g, '');
    if (!title) {
      return null;
    }
    return { title };
  } catch (error) {
    options.logger.warn({ err: error }, 'Failed to generate conversation summary');
    return null;
  }
}

/**
 * Parses list limits provided via query parameters and constrains them to a
 * safe range for DynamoDB queries.
 */
function clampLimit(raw: string): number | undefined {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(Math.floor(parsed), 500);
}

/**
 * Parses search limit parameters with sane defaults and bounds checking.
 */
function clampSearchLimit(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(Math.max(1, Math.floor(parsed)), 100);
}

/**
 * Produces a short snippet surrounding the query match in the stored message
 * so search results remain contextual.
 */
function buildSearchSnippet(content: string, query: string, radius = 60): string {
  const normalizedContent = content.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return buildMessagePreview(content, radius * 2);
  }

  const matchIndex = normalizedContent.indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return buildMessagePreview(content, radius * 2);
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(content.length, matchIndex + normalizedQuery.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';

  return `${prefix}${content.slice(start, end)}${suffix}`;
}

/**
 * Wraps the Server-Sent Events plumbing in a tiny helper so the streaming
 * handler can remain focused on business logic.
 */
function createSseChannel(req: IncomingMessage, res: ServerResponse, onClose?: () => void) {
  let closed = false;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  (res as any).flushHeaders?.();

  req.on('close', () => {
    closed = true;
    onClose?.();
  });

  return {
    send(event: string, data: unknown) {
      if (closed || res.writableEnded) {
        return;
      }
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed || res.writableEnded) {
        return;
      }
      closed = true;
      res.end();
    },
  };
}
