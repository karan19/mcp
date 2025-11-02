import { XMLParser } from 'fast-xml-parser';
import { McpToolDefinition, ToolHandler } from './types';

interface ArxivEntry {
  title?: string;
  summary?: string;
  id?: string;
  updated?: string;
  published?: string;
  author?: Array<{ name?: string }> | { name?: string };
}

const parser = new XMLParser({ ignoreAttributes: false });

export const searchArxivDefinition: McpToolDefinition = {
  name: 'search.arxiv',
  friendlyName: 'arXiv Paper Search',
  description: 'Searches arXiv for academic papers matching a query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for arXiv (uses all fields).',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (max 10).',
      },
    },
    required: ['query'],
  },
};

export const searchArxivHandler: ToolHandler = async (args) => {
  const query = String(args.query ?? '').trim();
  const maxResults = Math.min(Number(args.maxResults ?? 5), 10);

  if (!query) {
    throw new Error('query is required');
  }

  const endpoint = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}`;

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/atom+xml',
      'User-Agent': 'NexusNote-MCP/0.1 (+https://example.com)',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`arXiv request failed with status ${response.status}: ${body}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml, true);
  const entriesRaw: ArxivEntry[] = [].concat(parsed?.feed?.entry || []);

  if (!entriesRaw.length) {
    return {
      content: [
        {
          type: 'text',
          text: `No arXiv results found for "${query}".`,
        },
      ],
    };
  }

  const bullets = entriesRaw.map((entry, index) => {
    const title = entry.title?.trim() || 'Untitled Paper';
    const summary = entry.summary?.trim().replace(/\s+/g, ' ') || 'No abstract available.';
    const url = entry.id || 'N/A';
    const authorsArray = Array.isArray(entry.author) ? entry.author : entry.author ? [entry.author] : [];
    const authors = authorsArray.map((a) => a.name).filter(Boolean).join(', ');

    return `${index + 1}. ${title}
   URL: ${url}
   Authors: ${authors || 'Unknown'}
   Summary: ${summary}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Top arXiv results for "${query}":\n${bullets.join('\n')}`,
      },
    ],
  };
};
