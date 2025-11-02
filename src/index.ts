import { loadEnvConfig } from './config/env';
import { createMcpServer } from './server/mcp-server';

const config = loadEnvConfig();

async function main() {
  const server = createMcpServer({
    port: config.port,
    host: config.host,
    cognito: config.cognito,
    bedrock: config.bedrock,
  });

  server.start();
}

main().catch((error) => {
  console.error('Failed to bootstrap MCP server scaffold', error);
  process.exit(1);
});
