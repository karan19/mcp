import { McpToolDefinition, ToolHandler } from './types';

interface AwsDocHit {
  title?: string;
  url?: string;
  excerpt?: string;
}

export const searchAwsDocsDefinition: McpToolDefinition = {
  name: 'search.aws_docs',
  description: 'Searches AWS documentation using the public docs search API.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for AWS docs.',
      },
      numResults: {
        type: 'number',
        description: 'Number of results to return (max 10).',
      },
    },
    required: ['query'],
  },
};

export const searchAwsDocsHandler: ToolHandler = async (args) => {
  const query = String(args.query ?? '').trim();
  const numResults = Math.min(Number(args.numResults ?? 5), 10);

  if (!query) {
    throw new Error('query is required');
  }

  const endpoint = new URL('https://docs.aws.amazon.com/search/doc-search.json');
  endpoint.searchParams.set('searchPath', 'all');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('maxResults', String(numResults));

  const response = await fetch(endpoint.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AWS docs search failed with status ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const hits: AwsDocHit[] = payload?.hits?.hit || [];

  if (!hits.length) {
    return {
      content: [
        {
          type: 'text',
          text: `No AWS documentation results found for "${query}".`,
        },
      ],
    };
  }

  const bullets = hits.slice(0, numResults).map((hit, index) => {
    const title = hit.title || 'Untitled AWS doc';
    const url = hit.url || 'N/A';
    const excerpt = (hit.excerpt || '').replace(/<[^>]*>/g, '').trim();
    return `${index + 1}. ${title}\n   URL: ${url}\n   Summary: ${excerpt || 'No summary available.'}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Top AWS documentation results for "${query}":\n${bullets.join('\n')}`,
      },
    ],
  };
};
