import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocumentClient } from '../datasources/dynamo';
import { loadEnvConfig } from '../config/env';
import type { McpToolDefinition, ToolHandler } from './types';

type ToolEntry = { definition: McpToolDefinition; handler: ToolHandler };

const envConfig = loadEnvConfig();

function sanitizeToolName(tableName: string) {
  return tableName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

const TABLE_DESCRIPTIONS: Record<string, string> = {
  'nexusnote-before-i-forget-production':
    'User reminders captured in “before I forget” flow.',
  'nexusnote-chat-conversations-production':
    'Stored chat conversations and their participants.',
  'nexusnote-debate-sessions-production':
    'Debate session metadata such as topic and status.',
  'nexusnote-debate-turns-production':
    'Individual debate turns within a session.',
  'nexusnote-implementation-projects-production':
    'Implementation projects assigned to a user.',
  'nexusnote-inno-contacts-production':
    'Innovation contacts and their latest updates.',
  'nexusnote-notes-production':
    'All notes captured per user.',
  'nexusnote-personas-production':
    'Configured AI personas per user.',
  'nexusnote-shared-data-production':
    'Shared mindmaps and their node data.',
  'nexusnote-soliloquies-production':
    'Recorded soliloquies mapped by user.',
  'nexusnote-thought-tags-production':
    'Thought tags, counts, and last-used info.',
  'nexusnote-thoughts-production':
    'Thought entries written by the user.',
  'nexusnote-tracking-workboard-production':
    'Tracking workboard slots, chains, and tasks.',
  'GhostInfraStack-PostsTableC82B36F0-1OY982XQPEJ9X':
    'Ghost CMS posts with rendered HTML content (keyed by slug).',
};

const TABLE_FRIENDLY_NAMES: Record<string, string> = {
  'nexusnote-before-i-forget-production': 'Before I Forget Reminders',
  'nexusnote-chat-conversations-production': 'Chat Conversations',
  'nexusnote-debate-sessions-production': 'Debate Sessions',
  'nexusnote-debate-turns-production': 'Debate Turns',
  'nexusnote-implementation-projects-production': 'Implementation Projects',
  'nexusnote-inno-contacts-production': 'Innovation Contacts',
  'nexusnote-notes-production': 'Notes',
  'nexusnote-personas-production': 'AI Personas',
  'nexusnote-shared-data-production': 'Shared Mindmaps',
  'nexusnote-soliloquies-production': 'Soliloquies',
  'nexusnote-thought-tags-production': 'Thought Tags',
  'nexusnote-thoughts-production': 'Thoughts',
  'nexusnote-tracking-workboard-production': 'Tracking Workboard',
  'GhostInfraStack-PostsTableC82B36F0-1OY982XQPEJ9X': 'Ghost Posts',
};

function defaultFriendlyName(tableName: string): string {
  const withoutPrefix = tableName.replace(/^nexusnote[-_]?/i, '');
  const withoutSuffix = withoutPrefix.replace(/[-_]?production$/i, '');
  return withoutSuffix
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

function buildDescription(tableName: string, partitionKey: string, sortKey?: string) {
  const custom = TABLE_DESCRIPTIONS[tableName];
  if (custom) {
    return custom;
  }
  const base = `Query the DynamoDB table \\"${tableName}\\" using the ${partitionKey} partition key`;
  if (sortKey) {
    return `${base} and optional ${sortKey} sort key.`;
  }
  return `${base}.`;
}

function buildSchema(partitionKey: string, sortKey?: string): McpToolDefinition['inputSchema'] {
  const properties: Record<string, unknown> = {
    [partitionKey]: {
      type: 'string',
      description: `Value for the partition key \\"${partitionKey}\\".`,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of items to return (default 10, max 25).',
    },
    projection: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional list of attribute names to include in the response.',
    },
  };

  const required = [partitionKey];

  if (sortKey) {
    properties[sortKey] = {
      type: 'string',
      description: `Optional exact value for the sort key \\"${sortKey}\\".`,
    };
    properties['sortBeginsWith'] = {
      type: 'string',
      description: `Optional prefix match for the sort key \\"${sortKey}\\" (ignored if an exact value is provided).`,
    };
    properties['scanForward'] = {
      type: 'boolean',
      description: 'When true, results are returned in ascending order of the sort key (default true).',
    };
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

function formatItems(tableName: string, items: any[]): string {
  if (!items.length) {
    return `No items found in ${tableName} for the provided keys.`;
  }
  if (items.length === 1) {
    return `Found 1 item in ${tableName}:\n${JSON.stringify(items[0], null, 2)}`;
  }
  return `Found ${items.length} items in ${tableName} (showing first ${items.length}):\n${JSON.stringify(items, null, 2)}`;
}

async function queryTable(
  tableName: string,
  partitionKey: string,
  sortKey: string | undefined,
  args: Record<string, unknown>,
): Promise<string> {
  const partitionValue = args[partitionKey];
  if (partitionValue === undefined || partitionValue === null || partitionValue === '') {
    throw new Error(`The property \\"${partitionKey}\\" is required.`);
  }

  const limitRaw = Number(args.limit ?? 10);
  const limit = Number.isNaN(limitRaw) ? 10 : Math.min(Math.max(Math.floor(limitRaw), 1), 25);

  const projection = Array.isArray(args.projection)
    ? (args.projection as string[]).filter((item) => typeof item === 'string' && item.trim().length > 0)
    : undefined;

  if (sortKey) {
    const sortValue = args[sortKey];
    const sortBeginsWith = typeof args.sortBeginsWith === 'string' ? args.sortBeginsWith : undefined;
    const scanForward = args.scanForward === undefined ? true : Boolean(args.scanForward);

    const expressionNames: Record<string, string> = {
      '#pk': partitionKey,
    };
    const expressionValues: Record<string, unknown> = {
      ':pk': partitionValue,
    };

    let keyCondition = '#pk = :pk';

    if (sortValue !== undefined && sortValue !== null && sortValue !== '') {
      expressionNames['#sk'] = sortKey;
      expressionValues[':sk'] = sortValue;
      keyCondition += ' AND #sk = :sk';
    } else if (sortBeginsWith) {
      expressionNames['#sk'] = sortKey;
      expressionValues[':skPrefix'] = sortBeginsWith;
      keyCondition += ' AND begins_with(#sk, :skPrefix)';
    }

    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      Limit: limit,
      ScanIndexForward: scanForward,
      ProjectionExpression: projection?.length ? projection.join(', ') : undefined,
    });

    const result = await dynamoDocumentClient.send(command);
    return formatItems(tableName, result.Items ?? []);
  }

  const command = new GetCommand({
    TableName: tableName,
    Key: {
      [partitionKey]: partitionValue,
    },
    ProjectionExpression: projection?.length ? projection.join(', ') : undefined,
  });

  const result = await dynamoDocumentClient.send(command);
  return formatItems(tableName, result.Item ? [result.Item] : []);
}

const dynamoTableTools: ToolEntry[] = envConfig.dynamodbTables.map((table) => {
  const toolName = `query.dynamodb.${sanitizeToolName(table.tableName)}`;
  const definition: McpToolDefinition = {
    name: toolName,
    friendlyName: TABLE_FRIENDLY_NAMES[table.tableName] ?? defaultFriendlyName(table.tableName),
    description: buildDescription(table.tableName, table.partitionKey, table.sortKey),
    inputSchema: buildSchema(table.partitionKey, table.sortKey),
  };

  const handler: ToolHandler = async (args, context) => {
    try {
      const output = await queryTable(table.tableName, table.partitionKey, table.sortKey, args);
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      context.logger.error({ err: error, table: table.tableName }, 'DynamoDB query failed');
      throw error;
    }
  };

  return { definition, handler };
});

export { dynamoTableTools };
