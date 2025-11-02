import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import crypto from 'crypto';
import pino from 'pino';
import { WebSocketServer, WebSocket } from 'ws';
import type { BedrockConfig, CognitoConfig } from '../config/env';
import { runChatTurn } from '../ai/orchestrator';
import { createCognitoVerifier } from './auth';
import { toolDefinitions, toolRegistry } from '../tools';

const logger = pino({ name: 'mcp-server', level: 'info' });

interface ServerOptions {
  host: string;
  port: number;
  cognito: CognitoConfig;
  bedrock: BedrockConfig;
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

function applyCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
  verifyToken: (token: string) => Promise<{ sub: string; email?: string }>
) {
  return async function handleChat(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') {
      sendErrorJson(res, 405, 'Method not allowed');
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendErrorJson(res, 401, 'Missing Authorization header');
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    let requester;
    try {
      requester = await verifyToken(token);
    } catch (error) {
      logger.warn({ err: error }, 'Token verification failed');
      sendErrorJson(res, 401, 'Invalid token');
      return;
    }

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

    logger.info({ user: requester.sub }, 'Received chat turn');

    try {
      const result = await runChatTurn({
        userMessage: message,
        bedrock,
        toolDefinitions,
        toolRegistry,
        logger,
      });

      sendJson(res, 200, {
        reply: result.reply,
        toolCalls: result.toolCalls,
      });
    } catch (error) {
      logger.error({ err: error }, 'Chat orchestrator failed');
      sendErrorJson(res, 500, 'Failed to process chat request');
    }
  };
}

export function createMcpServer(options: ServerOptions) {
  const { host, port, cognito, bedrock } = options;
  const verifyToken = createCognitoVerifier(cognito);
  const chatHandler = createChatHandler(bedrock, verifyToken);

  const httpServer = createServer(async (req, res) => {
    applyCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';
    if (req.method === 'GET' && url.startsWith('/health')) {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'POST' && url === '/chat') {
      await chatHandler(req, res);
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
