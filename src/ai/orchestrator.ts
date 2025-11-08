import type { Logger } from 'pino';
import type { BedrockConfig } from '../config/env';
import type { McpToolDefinition, ToolRegistryEntry } from '../tools';
import { invokeModel, type ChatMessage } from './bedrock';
import { buildToolCatalog, formatToolCatalog } from './toolCatalog';
import { buildAnswerPrompt, buildDecisionPrompt, summarizeToolOutput } from './toolPrompts';

interface ToolRegistry {
  [name: string]: ToolRegistryEntry;
}

interface FirstPassDecision {
  action: 'call_tool' | 'respond';
  tool?: string;
  arguments?: Record<string, unknown>;
  response?: string;
}

export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  output: string[];
}

export interface RunChatTurnOptions {
  userMessage: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  bedrock: BedrockConfig;
  toolDefinitions: McpToolDefinition[];
  toolRegistry: ToolRegistry;
  logger: Logger;
  currentUserId?: string;
}

export interface RunChatTurnResult {
  reply: string | { tools: Array<{ name: string; description: string }> };
  toolCalls: ToolCallRecord[];
}

function extractFirstJsonObject(raw: string): string | null {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) {
    return null;
  }

  let depth = 0;
  for (let i = startIdx; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function parseModelJsonResponse(raw: string): FirstPassDecision {
  const trimmed = raw.trim();
  let candidate = trimmed;

  const codeFenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (codeFenceMatch && codeFenceMatch[1]) {
    candidate = codeFenceMatch[1];
  } else {
    const extracted = extractFirstJsonObject(candidate);
    if (extracted) {
      candidate = extracted;
    }
  }

  const startIdx = candidate.indexOf('{');
  if (startIdx === -1) {
    throw new Error('Model response did not contain valid JSON.');
  }

  const parsed = JSON.parse(candidate) as FirstPassDecision;

  if (parsed.action !== 'call_tool' && parsed.action !== 'respond') {
    throw new Error(`Unsupported action "${parsed.action}" from model.`);
  }

  if (parsed.action === 'call_tool' && !parsed.tool) {
    throw new Error('Model requested a tool call without specifying a tool name.');
  }

  return parsed;
}

export async function runChatTurn(options: RunChatTurnOptions): Promise<RunChatTurnResult> {
  const { userMessage, history = [], bedrock, toolDefinitions, toolRegistry, logger } = options;

  const catalogEntries = buildToolCatalog(toolDefinitions);
  const toolCatalogText = formatToolCatalog(catalogEntries);
  const relevantHistory = history.slice(-10);
  const historyTranscript = relevantHistory
    .map((entry) => {
      const speaker = entry.role === 'assistant' ? 'Assistant' : 'User';
      return `${speaker}: ${entry.content}`;
    })
    .join('\n');

  const decisionPrompt = buildDecisionPrompt({
    userMessage,
    historyTranscript,
    catalogText: toolCatalogText,
  });

  const decisionMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are an orchestration planner that decides whether to call tools before answering the user. Output only JSON responses that conform to the instructions.',
    },
    {
      role: 'user',
      content: decisionPrompt,
    },
  ];

  const decisionRaw = await invokeModel(bedrock, {
    messages: decisionMessages,
    maxOutputTokens: 256,
    temperature: 0,
  });

  let decision: FirstPassDecision;
  try {
    decision = parseModelJsonResponse(decisionRaw);
  } catch (error) {
    logger.warn({ err: error, raw: decisionRaw }, 'Failed to parse model decision; falling back to direct answer');
    decision = {
      action: 'respond',
      response: decisionRaw,
    };
  }

  if (decision.action === 'respond' && decision.response) {
    return {
      reply: decision.response,
      toolCalls: [],
    };
  }

  if (decision.action === 'call_tool' && decision.tool) {
    const entry = toolRegistry[decision.tool];
    if (!entry) {
      logger.warn({ tool: decision.tool }, 'Model requested unknown tool');
      return {
        reply: "I couldn't use the requested tool. Please try another question.",
        toolCalls: [],
      };
    }

    let handlerResult;
    try {
      handlerResult = await entry.handler(decision.arguments ?? {}, {
        logger,
        currentUserId: options.currentUserId,
      });
    } catch (error) {
      logger.error({ err: error, tool: decision.tool }, 'Tool invocation failed');
      return {
        reply: 'I encountered an error while retrieving the requested information. Please try again later.',
        toolCalls: [],
      };
    }

    const toolSummary = summarizeToolOutput(handlerResult.content);

    const answerPrompt = buildAnswerPrompt({
      toolId: decision.tool,
      userMessage,
      historyTranscript,
      toolOutput: toolSummary,
    });

    const answerMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are the NexusNote assistant. Use provided tool outputs faithfully, avoid fabrications, and cite sources in parentheses.',
      },
      {
        role: 'user',
        content: answerPrompt,
      },
    ];

    const answerRaw = await invokeModel(bedrock, {
      messages: answerMessages,
      maxOutputTokens: bedrock.maxOutputTokens,
      temperature: bedrock.temperature,
    });

    return {
      reply: answerRaw,
      toolCalls: [
        {
          toolName: decision.tool,
          arguments: decision.arguments ?? {},
          output: handlerResult.content
            .map((item) => (typeof item.text === 'string' ? item.text : ''))
            .filter((text) => text.length > 0),
        },
      ],
    };
  }

  return {
    reply: 'I was unable to process your request.',
    toolCalls: [],
  };
}
