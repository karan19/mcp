export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

export interface ToolContext {
  logger: { info: (obj: any, msg?: string) => void; error: (obj: any, msg?: string) => void; warn: (obj: any, msg?: string) => void; debug: (obj: any, msg?: string) => void };
}

export type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<McpToolResult>;
