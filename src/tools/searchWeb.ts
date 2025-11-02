import { McpToolDefinition, ToolHandler } from './types';

interface SerpApiOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
}

const SERP_API_KEY = process.env.SERPAPI_KEY || process.env.SEARCH_WEB_API_KEY;

export const searchWebDefinition: McpToolDefinition = {
  name: 'search.web',
  friendlyName: 'Open Web Search',
  description: 'Performs a web search using Google via SerpAPI. Requires SERPAPI_KEY environment variable.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to submit to Google.',
      },
      numResults: {
        type: 'number',
        description: 'Number of results to return (max 10).',
      },
    },
    required: ['query'],
  },
};

export const searchWebHandler: ToolHandler = async (args, context) => {
  const query = String(args.query ?? '').trim();
  const numResultsRaw = args.numResults;
  const numResults = Math.min(Number(numResultsRaw ?? 5), 10);

  if (!query) {
    throw new Error('query is required');
  }

  if (!SERP_API_KEY) {
    throw new Error('SERPAPI_KEY environment variable is not set. Web search tool is unavailable.');
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(numResults));
  url.searchParams.set('api_key', SERP_API_KEY);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    context.logger.error({ status: response.status, body }, 'SerpAPI request failed');
    throw new Error(`SerpAPI request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const organic: SerpApiOrganicResult[] = payload.organic_results ?? [];

  if (!organic.length) {
    return {
      content: [
        {
          type: 'text',
          text: `No results found for "${query}" using SerpAPI.`,
        },
      ],
    };
  }

  const bullets = organic.slice(0, numResults).map((result, index) => {
    const title = result.title ?? 'Untitled result';
    const link = result.link ?? 'N/A';
    const snippet = result.snippet ?? 'No summary available.';
    return `${index + 1}. ${title}\n   URL: ${link}\n   Summary: ${snippet}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Top web results for "${query}":\n${bullets.join('\n')}`,
      },
    ],
  };
};
