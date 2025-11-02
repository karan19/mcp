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

export interface EnvConfig {
  host: string;
  port: number;
  cognito: CognitoConfig;
  bedrock: BedrockConfig;
}

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

  return {
    host,
    port,
    cognito,
    bedrock,
  };
}
