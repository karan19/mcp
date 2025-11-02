#!/usr/bin/env node
import 'source-map-support/register';
import 'dotenv/config';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { McpStack } from '../lib/mcp-stack';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return undefined;
  }
  return value;
}

function optionalNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  return parsed;
}

function optionalFloatEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number.`);
  }
  return parsed;
}

function optionalBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new Error(`Environment variable ${name} must be a boolean (true/false).`);
}

const defaultRegion = optionalEnv('MCP_REGION') ?? 'us-west-2';

const CONFIG = {
  accountId: requireEnv('MCP_ACCOUNT_ID'),
  region: defaultRegion,
  stackName: optionalEnv('MCP_STACK_NAME') ?? 'McpStack',
  serpApiSecretName: optionalEnv('MCP_SERPAPI_SECRET_NAME') ?? 'nexusnote/mcp/search-api',
  containerImagePath: optionalEnv('MCP_CONTAINER_IMAGE_PATH') ?? path.resolve(__dirname, '..', '..'),
  cpu: optionalNumberEnv('MCP_CPU', 1024),
  memoryLimitMiB: optionalNumberEnv('MCP_MEMORY_LIMIT_MIB', 2048),
  desiredCount: optionalNumberEnv('MCP_DESIRED_COUNT', 1),
  servicePort: optionalNumberEnv('MCP_SERVICE_PORT', 8080),
  logLevel: optionalEnv('MCP_LOG_LEVEL') ?? 'info',
  cognitoRegion: optionalEnv('MCP_COGNITO_REGION') ?? defaultRegion,
  cognitoUserPoolId: requireEnv('MCP_COGNITO_USER_POOL_ID'),
  cognitoUserPoolClientId: requireEnv('MCP_COGNITO_USER_POOL_CLIENT_ID'),
  bedrockRegion: optionalEnv('MCP_BEDROCK_REGION') ?? defaultRegion,
  bedrockModelId: optionalEnv('MCP_BEDROCK_MODEL_ID') ?? 'meta.llama3-8b-instruct-v1:0',
  bedrockMaxOutputTokens: optionalNumberEnv('MCP_BEDROCK_MAX_OUTPUT_TOKENS', 512),
  bedrockTemperature: optionalFloatEnv('MCP_BEDROCK_TEMPERATURE', 0.2),
  certificateArn: optionalEnv('MCP_CERTIFICATE_ARN'),
  redirectHttpToHttps: optionalBooleanEnv('MCP_REDIRECT_HTTP_TO_HTTPS', true),
  apiDomainName: optionalEnv('MCP_API_DOMAIN_NAME'),
  hostedZoneDomainName: optionalEnv('MCP_HOSTED_ZONE_DOMAIN_NAME'),
  dynamoTableArns: (optionalEnv('MCP_DYNAMODB_TABLE_ARNS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
  dynamoTableConfig: optionalEnv('MCP_DYNAMODB_TABLE_CONFIG') ?? '',
  kmsKeyArn: optionalEnv('MCP_KMS_KEY_ARN'),
};

const app = new cdk.App();

new McpStack(app, CONFIG.stackName, {
  env: {
    account: CONFIG.accountId,
    region: CONFIG.region,
  },
  serpApiSecretName: CONFIG.serpApiSecretName,
  containerImagePath: CONFIG.containerImagePath,
  desiredCount: CONFIG.desiredCount,
  cpu: CONFIG.cpu,
  memoryLimitMiB: CONFIG.memoryLimitMiB,
  servicePort: CONFIG.servicePort,
  logLevel: CONFIG.logLevel,
  cognitoRegion: CONFIG.cognitoRegion,
  cognitoUserPoolId: CONFIG.cognitoUserPoolId,
  cognitoUserPoolClientId: CONFIG.cognitoUserPoolClientId,
  bedrockRegion: CONFIG.bedrockRegion,
  bedrockModelId: CONFIG.bedrockModelId,
  bedrockMaxOutputTokens: CONFIG.bedrockMaxOutputTokens,
  bedrockTemperature: CONFIG.bedrockTemperature,
  certificateArn: CONFIG.certificateArn,
  redirectHttpToHttps: CONFIG.redirectHttpToHttps,
  apiDomainName: CONFIG.apiDomainName,
  hostedZoneDomainName: CONFIG.hostedZoneDomainName,
  dynamoTableArns: CONFIG.dynamoTableArns,
  dynamoTableConfig: CONFIG.dynamoTableConfig,
  kmsKeyArn: CONFIG.kmsKeyArn,
});
