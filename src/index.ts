import { loadEnvConfig, type DynamoTableConfig } from './config/env';
import { createMcpServer } from './server/mcp-server';

// The server reads configuration once on boot so the values are available to
// every module without repeatedly parsing the environment.
const config = loadEnvConfig();

/**
 * Bootstraps the MCP server by resolving the chat history table configuration
 * and delegating to {@link createMcpServer}. The function is intentionally
 * small so the top-level module contains the entire startup sequence.
 */
async function main() {
  const chatTableName = process.env.MCP_CHAT_TABLE_NAME;
  let chatTable: DynamoTableConfig | undefined;

  if (chatTableName) {
    chatTable = config.dynamodbTables.find((entry) => entry.tableName === chatTableName);
  } else {
    chatTable = config.dynamodbTables[0];
  }

  if (!chatTable) {
    throw new Error(
      'Chat history table configuration not found. Set MCP_DYNAMODB_TABLE_CONFIG (and optionally MCP_CHAT_TABLE_NAME).'
    );
  }

  const server = createMcpServer({
    port: config.port,
    host: config.host,
    cognito: config.cognito,
    bedrock: config.bedrock,
    chatTable,
  });

  server.start();
}

main().catch((error) => {
  console.error('Failed to bootstrap MCP server scaffold', error);
  process.exit(1);
});
