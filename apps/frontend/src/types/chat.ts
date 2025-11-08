export type ChatRole = 'user' | 'assistant' | 'system';

export interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  output: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  toolCalls?: ToolCall[];
}

export interface ConversationSummary {
  sessionId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastRole?: ChatRole;
  lastMessagePreview?: string;
  title?: string;
}

export interface PersistedChatMessage {
  sessionId: string;
  createdAt: string;
  messageId: string;
  role: ChatRole;
  content: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSearchMatch {
  sessionId: string;
  messageId: string;
  content: string;
  snippet: string;
  createdAt: string;
  role: ChatRole;
  title?: string;
}
