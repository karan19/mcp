import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { appConfig } from '../config/env';
import type { ChatMessage } from '../types/chat';

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

const INITIAL_MESSAGE: ChatMessage = {
  id: createMessageId(),
  role: 'assistant',
  content: 'Hi there! Ask me anything about your NexusNote data sources.',
  createdAt: new Date().toISOString(),
};

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { getIdToken } = useAuth();

  const sendMessage = useCallback(
    async ({ content }: SendMessageArgs) => {
      if (!content.trim()) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, userMessage]);
      setPending(true);
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = await getIdToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${appConfig.apiBaseUrl}/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: content }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          reply?: string;
          toolCalls?: Array<{ toolName: string; arguments: Record<string, unknown>; output: string[] }>;
        };

        const replyText = payload.reply?.trim().length ? payload.reply : 'I received your message.';

        const assistantMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: replyText,
          createdAt: new Date().toISOString(),
          toolCalls: payload.toolCalls ?? [],
        };

        setMessages((current) => [...current, assistantMessage]);
      } catch (err) {
        const fallbackMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
          content:
            'I could not contact the assistant API. Please check your connection or try again shortly.',
          createdAt: new Date().toISOString(),
        };
        setMessages((current) => [...current, fallbackMessage]);
        const message = err instanceof Error ? err.message : 'Chat request failed.';
        setError(message);
      } finally {
        setPending(false);
      }
    },
    [getIdToken, setMessages]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([INITIAL_MESSAGE]);
    setError(null);
  }, []);

  const status = useMemo(
    () => ({
      messages,
      pending,
      error,
    }),
    [messages, pending, error]
  );

  return {
    ...status,
    sendMessage,
    reset,
  };
}
