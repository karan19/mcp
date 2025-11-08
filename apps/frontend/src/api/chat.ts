import { appConfig } from '../config/env';
import type { ConversationSearchMatch, ConversationSummary, PersistedChatMessage } from '../types/chat';

interface ConversationListResponse {
  conversations?: ConversationSummary[];
}

interface ConversationMessagesResponse {
  sessionId: string;
  messages: PersistedChatMessage[];
  summary?: ConversationSummary | null;
}

interface ConversationSearchResponse {
  matches?: ConversationSearchMatch[];
}

export async function buildAuthHeaders(getIdToken: () => Promise<string | null>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function fetchConversations(getIdToken: () => Promise<string | null>) {
  const headers = await buildAuthHeaders(getIdToken);
  const response = await fetch(`${appConfig.apiBaseUrl}/conversations`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to load conversations (${response.status})`);
  }

  const payload = (await response.json()) as ConversationListResponse;
  return payload.conversations ?? [];
}

export async function fetchConversationMessages(
  sessionId: string,
  getIdToken: () => Promise<string | null>
) {
  const headers = await buildAuthHeaders(getIdToken);
  const response = await fetch(
    `${appConfig.apiBaseUrl}/conversations/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'GET',
      headers,
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Conversation not found.');
    }
    if (response.status === 403) {
      throw new Error('You do not have access to this conversation.');
    }
    throw new Error(`Failed to load conversation (${response.status})`);
  }

  const payload = (await response.json()) as ConversationMessagesResponse;
  return {
    sessionId: payload.sessionId,
    messages: payload.messages ?? [],
    summary: payload.summary ?? null,
  };
}

export async function deleteConversationRequest(
  sessionId: string,
  getIdToken: () => Promise<string | null>
) {
  const headers = await buildAuthHeaders(getIdToken);
  const response = await fetch(`${appConfig.apiBaseUrl}/conversations/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers,
  });

  if (response.status === 404) {
    throw new Error('Conversation not found.');
  }
  if (response.status === 403) {
    throw new Error('You do not have access to this conversation.');
  }
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to delete conversation (${response.status})`);
  }
}

export async function searchConversationMessages(
  query: string,
  getIdToken: () => Promise<string | null>,
  limit = 20
) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const headers = await buildAuthHeaders(getIdToken);
  const params = new URLSearchParams({ query: trimmed, limit: String(limit) });
  const response = await fetch(`${appConfig.apiBaseUrl}/conversations/search?${params.toString()}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to search conversations (${response.status})`);
  }

  const payload = (await response.json()) as ConversationSearchResponse;
  return payload.matches ?? [];
}
