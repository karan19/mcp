import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
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

/**
 * Provides a singleton Bedrock client for the process. Reusing the instance
 * avoids the overhead of repeatedly establishing AWS SDK connections.
 */
function getClient(config: BedrockConfig) {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({
      region: config.region,
    });
  }
  return cachedClient;
}

/**
 * Invokes a Bedrock model and returns the trimmed textual response. The helper
 * normalises request payloads for the different model families we support.
 */
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

export interface StreamOptions extends InvokeOptions {
  onDelta?: (text: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Invokes a Bedrock model in streaming mode, forwarding deltas to the provided
 * callback and returning the concatenated response once the stream ends.
 */
export async function invokeModelStream(config: BedrockConfig, options: StreamOptions): Promise<string> {
  if (!supportsStreamingModel(config.modelId)) {
    throw new Error(`Model ${config.modelId} does not support streaming responses.`);
  }

  const client = getClient(config);
  const body = buildRequestPayload(config, options);
  const command = new InvokeModelWithResponseStreamCommand({
    modelId: config.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await client.send(command, {
    abortSignal: options.abortSignal,
  });
  const decoder = new TextDecoder();
  let fullText = '';

  for await (const event of response.body ?? []) {
    if (event.chunk) {
      const chunkString = decoder.decode(event.chunk.bytes ?? new Uint8Array());
      if (!chunkString) {
        continue;
      }

      try {
        const payload = JSON.parse(chunkString);
        const delta = extractStreamText(config.modelId, payload);
        if (delta && delta.length > 0) {
          fullText += delta;
          options.onDelta?.(delta);
        }
      } catch (error) {
        console.warn('Failed to parse Bedrock stream chunk', error);
      }
    } else if (event.internalServerException) {
      throw new Error(event.internalServerException.message ?? 'Bedrock stream internal error');
    } else if (event.throttlingException) {
      throw new Error(event.throttlingException.message ?? 'Bedrock stream throttled');
    } else if (event.validationException) {
      throw new Error(event.validationException.message ?? 'Bedrock stream validation error');
    } else if (event.modelStreamErrorException) {
      throw new Error(event.modelStreamErrorException.message ?? 'Bedrock model stream error');
    }
  }

  return fullText.trim();
}

/**
 * Separates system prompts from conversational turns because some Bedrock
 * models expect system content as a standalone field.
 */
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

/**
 * Converts the Anthropic-style chat message format used across the codebase
 * into the specific payload shape required by each supported Bedrock model.
 */
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

/**
 * Builds a simple plain text transcript used by models that do not support the
 * richer message structure. Optional assistant tags cue the model to continue
 * the dialogue.
 */
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

/**
 * Normalises raw responses coming back from Bedrock so callers can treat all
 * model families uniformly.
 */
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

/**
 * Indicates whether the configured model supports streaming inference.
 */
export function supportsStreamingModel(modelId: string): boolean {
  return modelId.startsWith('anthropic.');
}

/**
 * Pulls incremental text from Bedrock streaming payloads. The schema differs
 * across models so the helper centralises the decision tree.
 */
function extractStreamText(modelId: string, payload: any): string | null {
  if (modelId.startsWith('anthropic.')) {
    if (payload?.type === 'content_block_delta' && payload?.delta?.type === 'text_delta') {
      return payload.delta.text ?? null;
    }
    if (payload?.type === 'message_delta' && typeof payload?.delta?.text === 'string') {
      return payload.delta.text;
    }
    if (Array.isArray(payload?.delta?.content)) {
      return payload.delta.content
        .map((entry: any) => (typeof entry?.text === 'string' ? entry.text : ''))
        .join('');
    }
  }

  return null;
}
