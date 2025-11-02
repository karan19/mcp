import type { Logger } from 'pino';
import type { BedrockConfig } from '../config/env';
import type { McpToolDefinition, ToolRegistryEntry } from '../tools';
import { invokeModel, type ChatMessage } from './bedrock';

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
  bedrock: BedrockConfig;
  toolDefinitions: McpToolDefinition[];
  toolRegistry: ToolRegistry;
  logger: Logger;
}

export interface RunChatTurnResult {
  reply: string | { tools: Array<{ name: string; description: string }> };
  toolCalls: ToolCallRecord[];
}

function buildToolCatalog(toolDefinitions: McpToolDefinition[]): string {
  if (!toolDefinitions.length) {
    return 'No tools are available.';
  }

  return toolDefinitions
    .map((tool) => tool.friendlyName ?? tool.name)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
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
  const { userMessage, bedrock, toolDefinitions, toolRegistry, logger } = options;

  const toolCatalog = buildToolCatalog(toolDefinitions);

  const decisionPrompt = [
    `User question: ${userMessage}`,
    '',
    'Available tools:',
    toolCatalog,
    '',
    'Instructions:',
    '- If the user is asking about your own capabilities (e.g., "what tools can you use"), do not call an external tool. Instead, respond with JSON: {"action":"respond","response":"<natural language answer>"}. When you list tools, output a comma-separated list of tool names. When a friendly name exists, use it; otherwise use the tool id.',
    '- If an external tool is needed, respond with {"action":"call_tool","tool":"<tool_name>","arguments":{...}}.',
    '- If you can answer immediately without a tool, respond with {"action":"respond","response":"<answer>"} in plain English.',
    '- Prefer calling tools when the question needs fresh or factual data.',
  ].join('\n');

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
      });
    } catch (error) {
      logger.error({ err: error, tool: decision.tool }, 'Tool invocation failed');
      return {
        reply: 'I encountered an error while retrieving the requested information. Please try again later.',
        toolCalls: [],
      };
    }

    const toolTexts = handlerResult.content.map((item) => item.text);
    const toolSummary = toolTexts.join('\n\n');

    const answerPrompt = [
      `You requested tool "${decision.tool}" to help answer a question.`,
      `User question: ${userMessage}`,
      '',
      'Tool output:',
      toolSummary,
      '',
      'Compose a helpful answer using only the tool output.',
      `- Cite the source as (${decision.tool}) when referencing the data.`,
      '- Do not introduce external information or definitions unless they appear in the tool output.',
      '- Skip generic disclaimers about accuracy.',
    ].join('\n');

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
          output: toolTexts,
        },
      ],
    };
  }

  return {
    reply: 'I was unable to process your request.',
    toolCalls: [],
  };
}
