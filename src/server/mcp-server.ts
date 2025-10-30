import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import pino from 'pino';
import { toolDefinitions, toolRegistry } from '../tools';

const logger = pino({ name: 'mcp-server', level: process.env.LOG_LEVEL || 'info' });

interface ServerOptions {
  host: string;
  port: number;
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

export function createMcpServer(options: ServerOptions) {
  const { host, port } = options;
  const wss = new WebSocketServer({ host, port });

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
    logger.info({ host, port }, 'MCP server listening for connections');
  }

  return { start };
}
