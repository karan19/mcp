import type { McpToolDefinition } from '../tools';

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
}

/**
 * Normalises tool definitions into a lighter-weight structure that is easier
 * for LLM prompts to consume.
 */
export function buildToolCatalog(definitions: McpToolDefinition[]): ToolCatalogEntry[] {
  return definitions.map((tool) => ({
    id: tool.name,
    label: tool.friendlyName && tool.friendlyName.length > 0 ? tool.friendlyName : tool.name,
    description: tool.description ?? 'No description available.',
  }));
}

/**
 * Formats the tool catalog for inclusion in a prompt. The output is a sorted
 * bullet list so the model receives a predictable ordering.
 */
export function formatToolCatalog(entries: ToolCatalogEntry[]): string {
  if (entries.length === 0) {
    return 'No tools are available.';
  }

  const lines = entries
    .map((entry) => {
      if (entry.label === entry.id) {
        return `- ${entry.id}: ${entry.description}`;
      }
      return `- ${entry.label} (tool id: ${entry.id}): ${entry.description}`;
    })
    .sort((a, b) => a.localeCompare(b));

  return lines.join('\n');
}
