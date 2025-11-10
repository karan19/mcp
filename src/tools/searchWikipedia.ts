import { McpToolDefinition, ToolHandler } from './types';
import { performToolFetch } from './httpClient';

interface WikipediaSearchItem {
  title: string;
  snippet: string;
  pageid: number;
}

export const searchWikipediaDefinition: McpToolDefinition = {
  name: 'search.wikipedia',
  friendlyName: 'Wikipedia Lookup',
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

export const searchWikipediaHandler: ToolHandler = async (args, context) => {
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

  const cacheKey = `search.wikipedia|${language}|${query}|${numResults}`;

  const response = await performToolFetch(
    'search.wikipedia',
    context.logger,
    (signal) =>
      fetch(endpoint.toString(), {
        headers: {
          Accept: 'application/json',
        },
        signal,
      }),
    {
      timeoutMs: 8_000,
      cacheKey,
      cacheTtlMs: 5 * 60 * 1000,
      serveStaleOnError: true,
    }
  );

  const cacheStatus = response.headers.get('x-cache-status');
  const cacheAgeSeconds = response.headers.get('x-cache-age');
  const staleNote = cacheStatus === 'stale' ? ` (cached ${cacheAgeSeconds ?? '?'}s ago)` : '';

  const payload = await response.json();
  const items: WikipediaSearchItem[] = payload?.query?.search ?? [];

  if (!items.length) {
    return {
      content: [
        {
          type: 'text',
          text: `No Wikipedia results found for "${query}" (${language}).${staleNote}`,
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
        text: `Top Wikipedia results for "${query}" (${language}):${staleNote}\n${bullets.join('\n')}`,
      },
    ],
  };
};
