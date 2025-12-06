import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appConfig } from '../config/env';
import { useAuth } from '../context/AuthContext';
import {
  buildAuthHeaders,
  deleteConversationRequest,
  fetchConversationMessages,
  fetchConversations,
  searchConversationMessages,
} from '../api/chat';
import type {
  ChatMessage,
  ConversationSearchMatch,
  ConversationSummary,
  PersistedChatMessage,
  ToolCall,
} from '../types/chat';

interface SendMessageArgs {
  content: string;
}

interface InternalSendArgs {
  message: string;
  userMessage: ChatMessage;
}

function createMessageId() {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

interface ParsedSseEvent {
  event: string;
  data?: unknown;
}

interface AckData {
  sessionId: string;
}

interface StatusData {
  stage: string;
}

interface DecisionData {
  action: string;
  tool: string;
}

interface ToolCallData {
  toolName?: string;
  stage?: string;
}

interface AssistantDeltaData {
  text: string;
}

interface AssistantMessageData {
  messageId?: string;
  content?: string;
  createdAt?: string;
  toolCalls?: unknown[];
  sessionId?: string;
}

interface ErrorData {
  message?: string;
}

function isAckData(data: unknown): data is AckData {
  return typeof data === 'object' && data !== null && 'sessionId' in data;
}

function isStatusData(data: unknown): data is StatusData {
  return typeof data === 'object' && data !== null && 'stage' in data;
}

function isDecisionData(data: unknown): data is DecisionData {
  return typeof data === 'object' && data !== null && 'action' in data && 'tool' in data;
}

function isToolCallData(data: unknown): data is ToolCallData {
  return typeof data === 'object' && data !== null;
}

function isAssistantDeltaData(data: unknown): data is AssistantDeltaData {
  return typeof data === 'object' && data !== null && 'text' in data;
}

function isAssistantMessageData(data: unknown): data is AssistantMessageData {
  return typeof data === 'object' && data !== null;
}

function isErrorData(data: unknown): data is ErrorData {
  return typeof data === 'object' && data !== null;
}

export function useChatSession() {
  const { getIdToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [streamingActive, setStreamingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingAssistantRef = useRef<string | null>(null);
  const streamingEnabled = appConfig.chatStreamingEnabled && typeof ReadableStream !== 'undefined';

  const refreshConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const records = await fetchConversations(getIdToken);
      setConversations(records);
      setHistoryError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load conversations.';
      setHistoryError(message);
    } finally {
      setLoadingConversations(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    refreshConversations().catch(() => {
      /* handled in state */
    });
  }, [refreshConversations]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setPending(false);
    setPendingStatus('Generation stopped');
    setStreamingActive(false);
  }, []);

  const selectConversation = useCallback(
    async (targetSessionId: string) => {
      setLoadingHistory(true);
      setError(null);
      try {
        const result = await fetchConversationMessages(targetSessionId, getIdToken);
        const normalized = result.messages.map(mapServerMessage).sort(sortByTimestamp);
        setMessages(normalized);
        setSessionId(result.sessionId);
        setHistoryError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load conversation.';
        setHistoryError(message);
      } finally {
        setLoadingHistory(false);
      }
    },
    [getIdToken]
  );

  const sendStandardMessageInternal = useCallback(
    async ({ message, userMessage }: InternalSendArgs) => {
      setPendingStatus('Waiting for assistant…');
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const headers = await buildAuthHeaders(getIdToken);
        const response = await fetch(`${appConfig.apiBaseUrl}/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message,
            sessionId: sessionId ?? undefined,
            messageId: userMessage.id,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          reply?: unknown;
          toolCalls?: ToolCall[];
          sessionId?: string;
        };

        if (payload.sessionId) {
          setSessionId(payload.sessionId);
        }

        const assistantMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: formatReply(payload.reply),
          createdAt: new Date().toISOString(),
          toolCalls: payload.toolCalls ?? undefined,
        };

        setMessages((current) => [...current, assistantMessage]);
        await refreshConversations();
      } catch (err) {
        const fallbackMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: 'I could not contact the assistant API. Please try again shortly.',
          createdAt: new Date().toISOString(),
        };
        setMessages((current) => [...current, fallbackMessage]);
        const messageText = err instanceof Error ? err.message : 'Chat request failed.';
        setError(messageText);
      } finally {
        setPending(false);
        setPendingStatus(null);
      }
    },
    [getIdToken, refreshConversations, sessionId]
  );

  const sendStreamingMessageInternal = useCallback(
    async ({ message, userMessage }: InternalSendArgs) => {
      setPendingStatus('Connecting to assistant…');
      const controller = new AbortController();
      abortRef.current = controller;
      setStreamingActive(true);
      streamingAssistantRef.current = null;

      const headers = await buildAuthHeaders(getIdToken);
      headers.Accept = 'text/event-stream';

      const response = await fetch(`${appConfig.apiBaseUrl}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          sessionId: sessionId ?? undefined,
          messageId: userMessage.id,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Streaming chat request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let aborted = false;

      const handleEvent = (event: ParsedSseEvent) => {
        switch (event.event) {
          case 'ack':
            if (isAckData(event.data)) {
              setSessionId(event.data.sessionId);
            }
            setPendingStatus('Request received…');
            break;
          case 'status':
            if (isStatusData(event.data)) {
              setPendingStatus(describeStage(event.data.stage));
            }
            break;
          case 'decision':
            if (isDecisionData(event.data) && event.data.action === 'call_tool') {
              setPendingStatus(`Planning tool ${event.data.tool}…`);
            }
            break;
          case 'tool_call': {
            if (isToolCallData(event.data)) {
              const toolName = event.data.toolName ?? 'tool';
              if (event.data.stage === 'start') {
                setPendingStatus(`Running ${toolName}…`);
              } else if (event.data.stage === 'complete') {
                setPendingStatus(`Finished ${toolName}`);
              }
            }
            break;
          }
          case 'assistant_delta': {
            if (isAssistantDeltaData(event.data)) {
              const deltaText = event.data.text;
              if (!deltaText) {
                break;
              }
              if (!streamingAssistantRef.current) {
                const draftId = createMessageId();
                streamingAssistantRef.current = draftId;
                const draft: ChatMessage = {
                  id: draftId,
                  role: 'assistant',
                  content: deltaText,
                  createdAt: new Date().toISOString(),
                };
                setMessages((current) => [...current, draft]);
              } else {
                const targetId = streamingAssistantRef.current;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === targetId
                      ? { ...message, content: `${message.content}${deltaText}` }
                      : message
                  )
                );
              }
            }
            break;
          }
          case 'assistant_message': {
            if (isAssistantMessageData(event.data)) {
              setPending(false);
              setPendingStatus(null);
              const assistantMessage: ChatMessage = {
                id: typeof event.data.messageId === 'string' ? event.data.messageId : createMessageId(),
                role: 'assistant',
                content: typeof event.data.content === 'string' ? event.data.content : '',
                createdAt: typeof event.data.createdAt === 'string' ? event.data.createdAt : new Date().toISOString(),
                toolCalls: Array.isArray(event.data.toolCalls) ? (event.data.toolCalls as ToolCall[]) : undefined,
              };
              if (typeof event.data.sessionId === 'string') {
                setSessionId(event.data.sessionId);
              }
              setMessages((current) => {
                const targetId = streamingAssistantRef.current;
                if (targetId) {
                  let replaced = false;
                  const next = current.map((message) => {
                    if (message.id === targetId) {
                      replaced = true;
                      return assistantMessage;
                    }
                    return message;
                  });
                  streamingAssistantRef.current = null;
                  return replaced ? next : [...next, assistantMessage];
                }
                return [...current, assistantMessage];
              });
            }
            break;
          }
          case 'error': {
            setPending(false);
            setPendingStatus(null);
            streamingAssistantRef.current = null;
            let messageText = 'The assistant could not process your request.';
            if (isErrorData(event.data) && typeof event.data.message === 'string') {
              messageText = event.data.message;
            }
            setError(messageText);
            setMessages((current) => [
              ...current,
              {
                id: createMessageId(),
                role: 'assistant',
                content: 'I ran into an error while processing your request.',
                createdAt: new Date().toISOString(),
              },
            ]);
            break;
          }
          case 'done':
            setPending(false);
            setPendingStatus(null);
            streamingAssistantRef.current = null;
            break;
          default:
            break;
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          buffer = consumeSseBuffer(buffer, handleEvent);
        }
      } catch (err) {
        reader.releaseLock?.();
        if (controller.signal.aborted) {
          aborted = true;
        } else {
          throw err;
        }
      } finally {
        reader.releaseLock?.();
        setPending(false);
        setPendingStatus(null);
        setStreamingActive(false);
        if (controller.signal.aborted) {
          streamingAssistantRef.current = null;
        }
      }

      if (!aborted) {
        await refreshConversations();
      }
    },
    [getIdToken, refreshConversations, sessionId]
  );

  const sendMessage = useCallback(
    async ({ content }: SendMessageArgs) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, userMessage]);
      setPending(true);
      setPendingStatus('Sending message…');
      setError(null);

      abortRef.current?.abort();

      if (streamingEnabled) {
        try {
          await sendStreamingMessageInternal({ message: trimmed, userMessage });
          return;
        } catch (err) {
          console.warn('Streaming chat failed, falling back to standard flow', err);
        }
      }

      await sendStandardMessageInternal({ message: trimmed, userMessage });
    },
    [sendStandardMessageInternal, sendStreamingMessageInternal, streamingEnabled]
  );

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setError(null);
    setPendingStatus(null);
    streamingAssistantRef.current = null;
    setStreamingActive(false);
  }, []);

  const deleteConversation = useCallback(
    async (targetSessionId: string) => {
      setPending(true);
      try {
        await deleteConversationRequest(targetSessionId, getIdToken);
        setConversations((current) => current.filter((item) => item.sessionId !== targetSessionId));
        if (sessionId === targetSessionId) {
          setSessionId(null);
          setMessages([]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete conversation.';
        setError(message);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [getIdToken, sessionId]
  );

  const searchConversations = useCallback(
    async (query: string, limit = 20): Promise<ConversationSearchMatch[]> => {
      try {
        return await searchConversationMessages(query, getIdToken, limit);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to search conversations.';
        setError(message);
        throw err;
      }
    },
    [getIdToken]
  );

  const status = useMemo(
    () => ({
      messages,
      pending,
      streamingActive,
      pendingStatus,
      error,
      sessionId,
      conversations,
      loadingConversations,
      loadingHistory,
      historyError,
    }),
    [messages, pending, streamingActive, pendingStatus, error, sessionId, conversations, loadingConversations, loadingHistory, historyError]
  );

  return {
    ...status,
    sendMessage,
    startNewConversation,
    deleteConversation,
    refreshConversations,
    selectConversation,
    searchConversations,
    stopStreaming,
  };
}

function mapServerMessage(entry: PersistedChatMessage): ChatMessage {
  return {
    id: entry.messageId,
    role: entry.role,
    content: entry.content,
    createdAt: entry.createdAt,
    toolCalls: extractToolCalls(entry.metadata),
  };
}

function extractToolCalls(metadata: Record<string, unknown> | undefined): ToolCall[] | undefined {
  if (!metadata) {
    return undefined;
  }

  const raw = (metadata as { toolCalls?: unknown }).toolCalls;
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const calls: ToolCall[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const rawName = (item as { toolName?: unknown }).toolName;
    const args = (item as { arguments?: unknown }).arguments;
    const output = (item as { output?: unknown }).output;

    if (typeof rawName !== 'string' || typeof args !== 'object' || args === null || !Array.isArray(output)) {
      continue;
    }

    calls.push({
      toolName: rawName,
      arguments: args as Record<string, unknown>,
      output: output.filter((value): value is string => typeof value === 'string'),
    });
  }

  return calls.length ? calls : undefined;
}

function consumeSseBuffer(buffer: string, emit: (event: ParsedSseEvent) => void): string {
  let separatorIndex = buffer.indexOf('\n\n');
  while (separatorIndex !== -1) {
    const rawEvent = buffer.slice(0, separatorIndex);
    buffer = buffer.slice(separatorIndex + 2);

    if (rawEvent.trim().length === 0) {
      separatorIndex = buffer.indexOf('\n\n');
      continue;
    }

    const lines = rawEvent.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const dataPayload = dataLines.join('\n');
    let data: unknown;
    if (dataPayload) {
      try {
        data = JSON.parse(dataPayload);
      } catch {
        data = dataPayload;
      }
    }

    emit({ event: eventName, data });
    separatorIndex = buffer.indexOf('\n\n');
  }

  return buffer;
}

function describeStage(stage: unknown): string {
  if (typeof stage !== 'string') {
    return 'Processing…';
  }

  switch (stage) {
    case 'history_loading':
      return 'Loading conversation history…';
    case 'history_loaded':
      return 'History ready.';
    case 'user_message_stored':
      return 'Message saved.';
    case 'model_inference':
      return 'Thinking…';
    case 'assistant_reply_ready':
      return 'Preparing response…';
    case 'assistant_message_stored':
      return 'Assistant reply saved.';
    default:
      return 'Processing…';
  }
}

function sortByTimestamp(a: ChatMessage, b: ChatMessage) {
  return a.createdAt.localeCompare(b.createdAt);
}

function formatReply(reply: unknown): string {
  if (!reply) {
    return 'I received your message.';
  }

  if (typeof reply === 'string') {
    const trimmed = reply.trim();
    return trimmed.length ? trimmed : 'I received your message.';
  }

  if (
    typeof reply === 'object' &&
    reply !== null &&
    'tools' in reply &&
    Array.isArray((reply as { tools?: unknown }).tools)
  ) {
    const tools = (reply as {
      tools: Array<{ name?: string; friendlyName?: string; description?: string }>;
    }).tools;
    if (!tools.length) {
      return 'I do not have any tools available right now.';
    }
    const list = tools
      .map((tool) => {
        const label = tool.name ?? tool.friendlyName ?? 'Unnamed tool';
        const description = tool.description ?? 'No description available.';
        return `• ${label}: ${description}`;
      })
      .join('\n');
    return `Here are the tools I can use:\n${list}`;
  }

  try {
    return JSON.stringify(reply, null, 2);
  } catch {
    return 'I received your message.';
  }
}
