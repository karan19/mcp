import { McpToolDefinition, ToolHandler } from './types';

interface WikipediaSearchItem {
  title: string;
  snippet: string;
  pageid: number;
}

export const searchWikipediaDefinition: McpToolDefinition = {
  name: 'search.wikipedia',
  description: 'Searches Wikipedia articles and returns the top summaries.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms to lookup on Wikipedia.',
      },
      language: {
        type: 'string',
        description: 'Language code (default en).',
      },
      numResults: {
        type: 'number',
        description: 'Number of results to return (max 10).',
      },
    },
    required: ['query'],
  },
};

export const searchWikipediaHandler: ToolHandler = async (args) => {
  const query = String(args.query ?? '').trim();
  const language = String(args.language ?? 'en');
  const numResults = Math.min(Number(args.numResults ?? 5), 10);

  if (!query) {
    throw new Error('query is required');
  }

  const endpoint = new URL(`https://${language}.wikipedia.org/w/api.php`);
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('list', 'search');
  endpoint.searchParams.set('srsearch', query);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('utf8', '1');
  endpoint.searchParams.set('formatversion', '2');
  endpoint.searchParams.set('srlimit', String(numResults));

  const response = await fetch(endpoint.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wikipedia search failed with status ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const items: WikipediaSearchItem[] = payload?.query?.search ?? [];

  if (!items.length) {
    return {
      content: [
        {
          type: 'text',
          text: `No Wikipedia results found for "${query}" (${language}).`,
        },
      ],
    };
  }

  const bullets = items.map((item, index) => {
    const url = `https://${language}.wikipedia.org/?curid=${item.pageid}`;
    const snippet = item.snippet.replace(/<[^>]*>/g, '');
    return `${index + 1}. ${item.title}\n   URL: ${url}\n   Snippet: ${snippet}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Top Wikipedia results for "${query}" (${language}):\n${bullets.join('\n')}`,
      },
    ],
  };
};
