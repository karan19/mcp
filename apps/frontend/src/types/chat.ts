export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  output: string[];
}
