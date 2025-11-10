export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatSearchResult {
  sessionId: string;
  messageId: string;
  content: string;
  createdAt: string;
  role: ChatMessageRole;
  score?: number;
  highlights?: string[];
}
