# NexusNote MCP Server Scaffold

This directory contains an initial scaffold for the Anthropic Model Context Protocol (MCP) server that will power debate search/citation tooling. The goal is to let the debate feature call a local MCP endpoint while we iterate, and later move this folder into its own repository for dedicated deployment (ECS/App Runner, etc.).

## Folder layout

```
mcp/
  Dockerfile                 # production container image (multi-stage)
  .dockerignore              # excludes local artefacts from the image build
  package.json               # npm scripts and dependencies
  tsconfig.json              # TypeScript compiler options
  src/                       # MCP server source
    index.ts                 # entry point
    config/env.ts            # environment variable loader
    server/mcp-server.ts     # WebSocket server implementing MCP protocol
    tools/                   # MCP tool definitions and handlers
  infrastructure/            # Standalone AWS CDK app (Option A)
    package.json
    tsconfig.json
    cdk.json
    bin/mcp-infra.ts
    lib/mcp-stack.ts
```

## Running locally

```bash
cd mcp
npm install
npm run dev
# or build + run Node output
npm run build
npm run start:websocket
```

By default the server listens on `0.0.0.0:8080`. Configure `MCP_HOST` and `MCP_PORT` if you need different bindings.

### Required environment variables

| Variable          | Description                                             |
|-------------------|---------------------------------------------------------|
| `SERPAPI_KEY`     | API key for SerpAPI (used by `search.web`).             |
| `LOG_LEVEL`       | Optional Pino log level (`info` by default).            |

All other tools (Wikipedia, arXiv, AWS docs) rely on public APIs and do not require keys.

## Container image

A production-ready `Dockerfile` is provided and builds a multi-stage Node.js 20 image. Example build command:

```bash
cd mcp
docker build -t nexusnote-mcp .
```

The runtime stage installs only production dependencies and boots `dist/index.js`.

## Option A — Embedded CDK infrastructure

The `infrastructure/` folder contains a standalone AWS CDK v2 application that deploys the MCP server on ECS Fargate behind an Application Load Balancer. The stack builds the container image directly from the `mcp/` directory, provisions a VPC with a NAT gateway, and wires Secrets Manager to the runtime (`SERPAPI_KEY`).

### Prerequisites

1. Bootstrap the target AWS environment if you have not already:
   ```bash
   cd mcp/infrastructure
   npm install
   npx cdk bootstrap
   ```
2. Store your SerpAPI key in AWS Secrets Manager (string secret is expected), for example:
   ```bash
   aws secretsmanager create-secret \
     --name nexusnote/mcp/serpapi \
     --secret-string "<YOUR_SERPAPI_KEY>"
   ```
3. Ensure Docker is available locally so CDK can build the image asset.

### Deploy

```bash
cd mcp/infrastructure
npm install                # one-time
npm run build
export SERPAPI_SECRET_NAME=nexusnote/mcp/serpapi
# Optional overrides:
# export STACK_NAME=NexusNoteMcpStack
# export MCP_DESIRED_COUNT=2
# export MCP_FARGATE_CPU=1024
# export MCP_FARGATE_MEMORY=2048
# export MCP_LOG_LEVEL=debug
npm run synth
npm run deploy
```

Outputs include the Application Load Balancer DNS name and a `ws://` URL you can plug into the debate backend.

### Stack behaviour

- VPC with two AZs and one NAT gateway (required for outbound internet calls to SerpAPI, Wikipedia, etc.).
- Fargate service with configurable CPU, memory, desired count, and port (defaults: 512 CPU, 1024 MiB, 1 task, port 8080).
- Secrets Manager integration for `SERPAPI_KEY`.
- CloudWatch Logs group `/nexusnote/mcp/{stackName}` retaining logs for 30 days.
- ALB health checks accept HTTP status codes `200-499`, allowing the WebSocket server’s 426 upgrade response to pass.

## Next steps

- Wire the debate backend to call the deployed MCP WebSocket endpoint.
- Add CI/CD to build and push the image automatically (ECR + CDK deploy).
- Expand the test suite to cover each MCP tool’s error handling and API quota limits.

## TODO

- [ ] Automate MCP image builds and CDK deploys through CI so the service stays in sync with NexusNote releases.
- [ ] Tighten network access when exposing beyond internal integrations (e.g., restrict the ALB security group or front with a private link).
