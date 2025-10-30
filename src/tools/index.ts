import { McpToolDefinition, ToolHandler } from './types';
import { searchWebDefinition, searchWebHandler } from './searchWeb';
import { searchWikipediaDefinition, searchWikipediaHandler } from './searchWikipedia';
import { searchArxivDefinition, searchArxivHandler } from './searchArxiv';
import { searchAwsDocsDefinition, searchAwsDocsHandler } from './searchAwsDocs';

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
  [searchAwsDocsDefinition.name]: {
    definition: searchAwsDocsDefinition,
    handler: searchAwsDocsHandler,
  },
};

export const toolDefinitions: McpToolDefinition[] = Object.values(toolRegistry).map((entry) => entry.definition);
