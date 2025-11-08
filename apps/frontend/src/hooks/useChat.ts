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

function createMessageId() {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function useChatSession() {
  const { getIdToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const headers = await buildAuthHeaders(getIdToken);
        const response = await fetch(`${appConfig.apiBaseUrl}/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: trimmed,
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
        const message = err instanceof Error ? err.message : 'Chat request failed.';
        setError(message);
      } finally {
        setPending(false);
      }
    },
    [getIdToken, refreshConversations, sessionId]
  );

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setError(null);
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
      error,
      sessionId,
      conversations,
      loadingConversations,
      loadingHistory,
      historyError,
    }),
    [messages, pending, error, sessionId, conversations, loadingConversations, loadingHistory, historyError]
  );

  return {
    ...status,
    sendMessage,
    startNewConversation,
    deleteConversation,
    refreshConversations,
    selectConversation,
    searchConversations,
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
