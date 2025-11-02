import { McpToolDefinition, ToolHandler } from './types';
import { searchWikipediaDefinition, searchWikipediaHandler } from './searchWikipedia';

export interface ToolRegistryEntry {
  definition: McpToolDefinition;
  handler: ToolHandler;
}

export const toolRegistry: Record<string, ToolRegistryEntry> = {
  [searchWikipediaDefinition.name]: {
    definition: searchWikipediaDefinition,
    handler: searchWikipediaHandler,
  },
};

export const toolDefinitions: McpToolDefinition[] = Object.values(toolRegistry).map((entry) => entry.definition);
