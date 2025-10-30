import * as dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  host: string;
  port: number;
}

export function loadEnvConfig(): EnvConfig {
  const host = process.env.MCP_HOST || '0.0.0.0';
  const portRaw = process.env.MCP_PORT || '8080';
  const port = Number(portRaw);

  if (Number.isNaN(port)) {
    throw new Error(`Invalid MCP_PORT value: ${portRaw}`);
  }

  return {
    host,
    port,
  };
}
