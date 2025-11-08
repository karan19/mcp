import fs from 'node:fs';
import path from 'node:path';

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface BedrockConfig {
  region: string;
  modelId: string;
  maxOutputTokens: number;
  temperature: number;
}

export interface DynamoTableConfig {
  tableName: string;
  partitionKey: string;
  sortKey?: string;
  gsiName?: string;
  gsiPartitionKey?: string;
  gsiSortKey?: string;
}

export interface EnvConfig {
  host: string;
  port: number;
  cognito: CognitoConfig;
  bedrock: BedrockConfig;
  dynamodbTables: DynamoTableConfig[];
}

let localEnvLoaded = false;

function loadLocalEnv() {
  if (localEnvLoaded) {
    return;
  }
  localEnvLoaded = true;

  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    return;
  }

  try {
    const contents = fs.readFileSync(envPath, 'utf8');
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .forEach((line) => {
        const [key, ...rest] = line.split('=');
        if (!key) {
          return;
        }
        const value = rest.join('=').trim();
        if (value && process.env[key] === undefined) {
          process.env[key] = value;
        }
      });
  } catch (error) {
    console.warn('Failed to load .env.local', error);
  }
}

loadLocalEnv();

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  return parsed;
}

function parseDynamoTableConfig(raw: string | undefined): DynamoTableConfig[] {
  if (!raw || !raw.trim()) {
    return [];
  }

  return raw
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split('|').map((part) => part?.trim());
      if (parts.length < 2) {
        throw new Error(
          `Invalid MCP_DYNAMODB_TABLE_CONFIG entry "${entry}". Expected format tableName|partitionKey|[sortKey|gsiName|gsiPartitionKey|gsiSortKey].`,
        );
      }

      const [tableName, partitionKey, sortKey, gsiName, gsiPartitionKey, gsiSortKey] = parts;

      if (!tableName || !partitionKey) {
        throw new Error(
          `Invalid MCP_DYNAMODB_TABLE_CONFIG entry "${entry}". tableName and partitionKey are required.`,
        );
      }

      return {
        tableName,
        partitionKey,
        sortKey: sortKey || undefined,
        gsiName: gsiName || undefined,
        gsiPartitionKey: gsiPartitionKey || undefined,
        gsiSortKey: gsiSortKey || undefined,
      };
    });
}

export function loadEnvConfig(): EnvConfig {
  const host = process.env.MCP_HOST ?? '0.0.0.0';
  const port = readNumberEnv('MCP_PORT', 8080);

  const cognito: CognitoConfig = {
    region: readRequiredEnv('COGNITO_REGION'),
    userPoolId: readRequiredEnv('COGNITO_USER_POOL_ID'),
    clientId: readRequiredEnv('COGNITO_USER_POOL_CLIENT_ID'),
  };

  const bedrock: BedrockConfig = {
    region: readRequiredEnv('BEDROCK_REGION'),
    modelId: readRequiredEnv('BEDROCK_MODEL_ID'),
    maxOutputTokens: readNumberEnv('BEDROCK_MAX_OUTPUT_TOKENS', 512),
    temperature: Number(process.env.BEDROCK_TEMPERATURE ?? '0.2'),
  };

  if (Number.isNaN(bedrock.temperature)) {
    throw new Error('BEDROCK_TEMPERATURE must be a valid number.');
  }

  const dynamodbTables = parseDynamoTableConfig(process.env.MCP_DYNAMODB_TABLE_CONFIG);

  return {
    host,
    port,
    cognito,
    bedrock,
    dynamodbTables,
  };
}
