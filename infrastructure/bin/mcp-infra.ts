#!/usr/bin/env node
import 'source-map-support/register';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { McpStack } from '../lib/mcp-stack';

const CONFIG = {
  accountId: 'REPLACE_WITH_AWS_ACCOUNT_ID',
  region: 'us-east-1',
  stackName: 'McpStack',
  serpApiSecretName: 'nexusnote/mcp/search-api',
  containerImagePath: path.resolve(__dirname, '..', '..'),
  cpu: 1024,
  memoryLimitMiB: 2048,
  desiredCount: 1,
  servicePort: 8080,
  logLevel: 'info',
} as const;

if (!CONFIG.accountId || CONFIG.accountId === 'REPLACE_WITH_AWS_ACCOUNT_ID') {
  throw new Error('Set CONFIG.accountId in infrastructure/bin/mcp-infra.ts before deploying.');
}

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
});
