import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { BedrockConfig } from '../config/env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface InvokeOptions {
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

let cachedClient: BedrockRuntimeClient | null = null;

function getClient(config: BedrockConfig) {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({
      region: config.region,
    });
  }
  return cachedClient;
}

export async function invokeModel(config: BedrockConfig, options: InvokeOptions): Promise<string> {
  const client = getClient(config);
  const body = buildRequestPayload(config, options);

  const command = new InvokeModelCommand({
    modelId: config.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await client.send(command);
  const buffer = Buffer.from(response.body ?? new Uint8Array());
  const raw = buffer.toString('utf-8');
  return parseResponse(config.modelId, raw);
}

function splitMessages(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const conversation: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const trimmed = message.content.trim();
      if (trimmed) {
        systemParts.push(trimmed);
      }
    } else {
      conversation.push(message);
    }
  }

  const systemPrompt = systemParts.length ? systemParts.join('\n\n') : undefined;
  return { systemPrompt, conversation };
}

function buildRequestPayload(config: BedrockConfig, options: InvokeOptions) {
  const { systemPrompt, conversation } = splitMessages(options.messages);
  const maxTokens = options.maxOutputTokens ?? config.maxOutputTokens;
  const temperature = options.temperature ?? config.temperature;
  const modelId = config.modelId;

  if (modelId.startsWith('anthropic.')) {
    const messages = conversation.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    }));

    return {
      anthropic_version: 'bedrock-2023-05-31',
      system: systemPrompt,
      max_tokens: maxTokens,
      temperature,
      messages,
    };
  }

  if (modelId.startsWith('amazon.titan-text')) {
    const prompt = buildPlaintextPrompt(systemPrompt, conversation, { appendAssistantTag: true });
    return {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: maxTokens,
        temperature,
        topP: 0.9,
      },
    };
  }

  if (modelId.startsWith('meta.llama3')) {
    const prompt = buildPlaintextPrompt(systemPrompt, conversation, { appendAssistantTag: true });
    return {
      prompt,
      max_gen_len: maxTokens,
      temperature,
      top_p: 0.9,
    };
  }

  if (modelId.startsWith('mistral.')) {
    const prompt = conversation.map((message) => ({
      role: message.role,
      content: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    }));

    const payload: Record<string, unknown> = {
      prompt,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.9,
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    return payload;
  }

  throw new Error(`Unsupported Bedrock model: ${modelId}`);
}

function buildPlaintextPrompt(
  systemPrompt: string | undefined,
  conversation: ChatMessage[],
  options: { appendAssistantTag?: boolean } = {},
) {
  const lines: string[] = [];

  if (systemPrompt) {
    lines.push(`System: ${systemPrompt}`);
  }

  for (const message of conversation) {
    const label = message.role === 'assistant' ? 'Assistant' : 'User';
    lines.push(`${label}: ${message.content}`);
  }

  if (options.appendAssistantTag) {
    lines.push('Assistant:');
  }

  return lines.join('\n');
}

function parseResponse(modelId: string, raw: string): string {
  const payload = JSON.parse(raw);

  if (modelId.startsWith('anthropic.')) {
    const text = payload.content?.find((block: { type?: string }) => block.type === 'text')?.text;
    if (typeof text === 'string') {
      return text.trim();
    }
  } else if (modelId.startsWith('amazon.titan-text')) {
    const text =
      payload.results?.[0]?.outputText ??
      payload.results?.[0]?.tokenCount?.outputText ??
      payload.outputText;
    if (typeof text === 'string') {
      return text.trim();
    }
  } else if (modelId.startsWith('meta.llama3')) {
    const text = payload.generation ?? payload.generations?.[0]?.text ?? payload.outputs?.[0]?.text;
    if (typeof text === 'string') {
      return text.trim();
    }
  } else if (modelId.startsWith('mistral.')) {
    const text = payload.outputs?.[0]?.text ?? payload.result ?? payload.generations?.[0]?.text;
    if (typeof text === 'string') {
      return text.trim();
    }
  }

  throw new Error('Unsupported Bedrock model response format.');
}
