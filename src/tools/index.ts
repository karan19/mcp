import { McpToolDefinition, ToolHandler } from './types';
import { searchWikipediaDefinition, searchWikipediaHandler } from './searchWikipedia';
import { searchWebDefinition, searchWebHandler } from './searchWeb';
import { searchArxivDefinition, searchArxivHandler } from './searchArxiv';
import { dynamoTableTools } from './dynamodbTables';

export interface ToolRegistryEntry {
  definition: McpToolDefinition;
  handler: ToolHandler;
}

export const toolRegistry: Record<string, ToolRegistryEntry> = {
  [searchWebDefinition.name]: {
    definition: searchWebDefinition,
    handler: searchWebHandler,
  },
  [searchWikipediaDefinition.name]: {
    definition: searchWikipediaDefinition,
    handler: searchWikipediaHandler,
  },
  [searchArxivDefinition.name]: {
    definition: searchArxivDefinition,
    handler: searchArxivHandler,
  },
};

for (const entry of dynamoTableTools) {
  toolRegistry[entry.definition.name] = entry;
}

export const toolDefinitions: McpToolDefinition[] = Object.values(toolRegistry).map((entry) => entry.definition);

export type { McpToolDefinition } from './types';
