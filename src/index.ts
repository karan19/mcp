import { loadEnvConfig } from './config/env';
import { createMcpServer } from './server/mcp-server';

const config = loadEnvConfig();

async function main() {
  const server = await createMcpServer({
    port: config.port,
    host: config.host,
  });

  server.start();
}

main().catch((error) => {
  console.error('Failed to bootstrap MCP server scaffold', error);
  process.exit(1);
});
