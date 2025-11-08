import type { McpToolDefinition } from '../tools';

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
}

export function buildToolCatalog(definitions: McpToolDefinition[]): ToolCatalogEntry[] {
  return definitions.map((tool) => ({
    id: tool.name,
    label: tool.friendlyName && tool.friendlyName.length > 0 ? tool.friendlyName : tool.name,
    description: tool.description ?? 'No description available.',
  }));
}

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
