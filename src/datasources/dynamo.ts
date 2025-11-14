import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// A single DynamoDB client instance is shared across the server so we can reuse
// TCP connections and benefit from the SDK's internal pooling logic.
const baseClient = new DynamoDBClient({});

/**
 * Document client wrapper configured to strip undefined values. This mirrors
 * the behaviour of the DynamoDB console and saves us from manually pruning
 * payloads before writes.
 */
export const dynamoDocumentClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
