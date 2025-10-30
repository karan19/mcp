#!/usr/bin/env node
import 'source-map-support/register';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { McpStack } from '../lib/mcp-stack';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function parseNumber(value: string | undefined, label: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${label}: ${value}`);
  }

  return parsed;
}

const app = new cdk.App();

const serpApiSecretName = process.env.SERPAPI_SECRET_NAME;
if (!serpApiSecretName) {
  throw new Error('SERPAPI_SECRET_NAME environment variable must be set.');
}

const stackName = process.env.STACK_NAME ?? 'NexusNoteMcpStack';
const containerImagePath =
  process.env.MCP_IMAGE_PATH !== undefined
    ? path.resolve(process.env.MCP_IMAGE_PATH)
    : path.resolve(__dirname, '..', '..');

const cpu = parseNumber(process.env.MCP_FARGATE_CPU, 'MCP_FARGATE_CPU');
const memory = parseNumber(process.env.MCP_FARGATE_MEMORY, 'MCP_FARGATE_MEMORY');
const desiredCount = parseNumber(process.env.MCP_DESIRED_COUNT, 'MCP_DESIRED_COUNT');
const port = parseNumber(process.env.MCP_SERVICE_PORT, 'MCP_SERVICE_PORT');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
};

if (!env.account) {
  // CDK synthesizes fine without an explicit account but we surface a clearer error early.
  throw new Error('CDK_DEFAULT_ACCOUNT environment variable is required (set by `cdk bootstrap`).');
}

new McpStack(app, stackName, {
  env,
  serpApiSecretName,
  containerImagePath,
  desiredCount,
  cpu,
  memoryLimitMiB: memory,
  servicePort: port,
  logLevel: process.env.MCP_LOG_LEVEL ?? 'info',
});
