import { BatchWriteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoTableConfig } from '../config/env';

export type ChatMessageRole = 'user' | 'assistant' | 'system';
import { dynamoDocumentClient } from '../datasources/dynamo';

const SUMMARY_SORT_KEY = '__SUMMARY__';
const SUMMARY_ITEM_TYPE = 'summary';

export interface PersistedChatMessage {
  sessionId: string;
  createdAt: string;
  messageId: string;
  role: ChatMessageRole;
  content: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSessionSummary {
  sessionId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastRole?: ChatMessageRole;
  lastMessagePreview?: string;
  title?: string;
}

export interface ChatSessionSummaryInput {
  sessionId: string;
  userId: string;
  lastMessageAt: string;
  lastRole?: ChatMessageRole;
  lastMessagePreview?: string;
  title?: string;
}

interface ChatHistoryStore {
  listMessages(sessionId: string, limit?: number): Promise<PersistedChatMessage[]>;
  putMessage(message: PersistedChatMessage): Promise<void>;
  upsertSummary(input: ChatSessionSummaryInput): Promise<void>;
  listSummariesForUser(userId: string, limit?: number): Promise<ChatSessionSummary[]>;
  getSummary(sessionId: string): Promise<ChatSessionSummary | null>;
  deleteConversation(sessionId: string, userId: string): Promise<void>;
}

function isSummaryItem(sortKeyName: string, item: Record<string, any>): boolean {
  if (!item) {
    return false;
  }
  if (sortKeyName in item) {
    return item[sortKeyName] === SUMMARY_SORT_KEY;
  }
  return item.itemType === SUMMARY_ITEM_TYPE;
}

export function createChatHistoryStore(config: DynamoTableConfig): ChatHistoryStore {
  const { tableName, partitionKey } = config;
  const sortKeyName = config.sortKey ?? 'createdAt';
  const hasSortKey = Boolean(config.sortKey);

  const gsiName = config.gsiName;
  const gsiPartitionKey = config.gsiPartitionKey;
  const gsiSortKey = config.gsiSortKey;

  const toMessage = (item: Record<string, any>): PersistedChatMessage => ({
    sessionId: item.sessionId,
    createdAt: item.createdAt,
    messageId: item.messageId,
    role: item.role,
    content: item.content,
    userId: item.userId,
    metadata: item.metadata,
  });

  const toSummary = (item: Record<string, any>): ChatSessionSummary => ({
    sessionId: item.sessionId,
    userId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastMessageAt: item.lastMessageAt,
    lastRole: item.lastRole,
    lastMessagePreview: item.lastMessagePreview,
    title: item.title,
  });

  return {
    async listMessages(sessionId, limit) {
      const response = await dynamoDocumentClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: '#pk = :pk',
          ExpressionAttributeNames: {
            '#pk': partitionKey,
          },
          ExpressionAttributeValues: {
            ':pk': sessionId,
          },
          ScanIndexForward: true,
          Limit: limit,
        })
      );

      const items = response.Items ?? [];
      return items
        .filter((item) => !isSummaryItem(sortKeyName, item))
        .filter((item) => item.role && item.createdAt && item.messageId)
        .map((item) => toMessage(item as Record<string, any>));
    },

    async putMessage(message) {
      const item: Record<string, unknown> = {
        [partitionKey]: message.sessionId,
        [sortKeyName]: message.createdAt,
        ...message,
      };

      const command = new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: hasSortKey
          ? 'attribute_not_exists(#pk) AND attribute_not_exists(#sk)'
          : 'attribute_not_exists(#pk)',
        ExpressionAttributeNames: hasSortKey
          ? { '#pk': partitionKey, '#sk': sortKeyName }
          : { '#pk': partitionKey },
      });

      await dynamoDocumentClient.send(command);
    },

    async upsertSummary({ sessionId, userId, lastMessageAt, lastRole, lastMessagePreview, title }) {
      const now = new Date().toISOString();
      const key: Record<string, unknown> = {
        [partitionKey]: sessionId,
      };
      if (hasSortKey) {
        key[sortKeyName] = SUMMARY_SORT_KEY;
      }

      const updateNames: Record<string, string> = {
        '#itemType': 'itemType',
        '#userId': 'userId',
        '#lastMessageAt': 'lastMessageAt',
        '#updatedAt': 'updatedAt',
        '#lastRole': 'lastRole',
        '#lastMessagePreview': 'lastMessagePreview',
      };

      const updateValues: Record<string, unknown> = {
        ':itemType': SUMMARY_ITEM_TYPE,
        ':userId': userId,
        ':lastMessageAt': lastMessageAt,
        ':updatedAt': now,
        ':lastRole': lastRole ?? null,
        ':lastMessagePreview': lastMessagePreview ?? null,
      };

      const setExpressions: string[] = [
        '#itemType = :itemType',
        '#userId = :userId',
        '#lastMessageAt = :lastMessageAt',
        '#updatedAt = :updatedAt',
        '#lastRole = :lastRole',
        '#lastMessagePreview = :lastMessagePreview',
      ];

      const canUpdateCreatedAt =
        sortKeyName !== 'createdAt' && gsiPartitionKey !== 'createdAt' && gsiSortKey !== 'createdAt';
      if (canUpdateCreatedAt) {
        updateNames['#createdAt'] = 'createdAt';
        updateValues[':createdAt'] = lastMessageAt;
        setExpressions.push('#createdAt = if_not_exists(#createdAt, :createdAt)');
      }

      if (title !== undefined) {
        updateNames['#title'] = 'title';
        updateValues[':title'] = title;
        setExpressions.push('#title = if_not_exists(#title, :title)');
      }

      if (gsiPartitionKey) {
        if (gsiPartitionKey !== 'userId') {
          updateNames['#gsiPk'] = gsiPartitionKey;
          updateValues[':gsiPk'] = userId;
          setExpressions.push('#gsiPk = :gsiPk');
        }
      }

      if (gsiSortKey) {
        if (gsiSortKey === 'lastMessageAt') {
          // already handled via #lastMessageAt assignment above
          updateValues[':lastMessageAt'] = lastMessageAt;
        } else {
          updateNames['#gsiSk'] = gsiSortKey;
          updateValues[':gsiSk'] = lastMessageAt;
          setExpressions.push('#gsiSk = :gsiSk');
        }
      }

      await dynamoDocumentClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: `SET ${setExpressions.join(', ')}`,
          ExpressionAttributeNames: updateNames,
          ExpressionAttributeValues: updateValues,
        })
      );
    },

    async listSummariesForUser(userId, limit) {
      if (!gsiName || !gsiPartitionKey) {
        const response = await dynamoDocumentClient.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: '#itemType = :summary AND #userId = :userId',
            ExpressionAttributeNames: {
              '#itemType': 'itemType',
              '#userId': 'userId',
            },
            ExpressionAttributeValues: {
              ':summary': SUMMARY_ITEM_TYPE,
              ':userId': userId,
            },
            Limit: limit,
          })
        );
        const items = response.Items ?? [];
        return items.map((item) => toSummary(item as Record<string, any>));
      }

      const response = await dynamoDocumentClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: gsiName,
          KeyConditionExpression: '#gsiPk = :gsiPk',
          ExpressionAttributeNames: {
            '#gsiPk': gsiPartitionKey,
          },
          ExpressionAttributeValues: {
            ':gsiPk': userId,
          },
          ScanIndexForward: false,
          Limit: limit,
        })
      );

      const items = (response.Items ?? []).filter((item) => isSummaryItem(sortKeyName, item));
      return items.map((item) => toSummary(item as Record<string, any>));
    },

    async getSummary(sessionId) {
      const key: Record<string, unknown> = {
        [partitionKey]: sessionId,
      };
      if (hasSortKey) {
        key[sortKeyName] = SUMMARY_SORT_KEY;
      }

      const response = await dynamoDocumentClient.send(
        new GetCommand({
          TableName: tableName,
          Key: key,
        })
      );

      if (!response.Item || !isSummaryItem(sortKeyName, response.Item)) {
        return null;
      }

      return toSummary(response.Item as Record<string, any>);
    },

    async deleteConversation(sessionId, userId) {
      const summary = await this.getSummary(sessionId);
      if (!summary) {
        throw new Error('Conversation not found.');
      }
      if (summary.userId !== userId) {
        throw new Error('You do not have access to this conversation.');
      }

      const response = await dynamoDocumentClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: '#pk = :pk',
          ExpressionAttributeNames: {
            '#pk': partitionKey,
          },
          ExpressionAttributeValues: {
            ':pk': sessionId,
          },
        })
      );

      const items = response.Items ?? [];
      if (items.length === 0) {
        return;
      }

      const keys = items.map((item) => {
        const keyEntry: Record<string, unknown> = {
          [partitionKey]: sessionId,
        };
        if (hasSortKey && sortKeyName in item) {
          keyEntry[sortKeyName] = item[sortKeyName];
        }
        return keyEntry;
      });

      for (let i = 0; i < keys.length; i += 25) {
        const chunk = keys.slice(i, i + 25);
        await dynamoDocumentClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [tableName]: chunk.map((keyEntry) => ({
                DeleteRequest: {
                  Key: keyEntry,
                },
              })),
            },
          })
        );
      }
    },
  };
}
