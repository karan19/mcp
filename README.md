# MCP Server

MCP-compatible WebSocket server with a companion Amplify-ready React frontend. Use the commands below to run locally, build containers, or deploy to AWS.

## Local Development

```bash
cd mcp
npm install
export SERPAPI_KEY=<your-serpapi-key>
export COGNITO_REGION=<aws-region>
export COGNITO_USER_POOL_ID=<user-pool-id>
export COGNITO_USER_POOL_CLIENT_ID=<app-client-id>
export BEDROCK_REGION=<aws-region>
export BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
npm run dev            # hot-reload server
# npm run build        # compile to dist/
# npm run start:websocket   # run compiled output
```

The server listens on `0.0.0.0:8080`. Modify `src/config/env.ts` if you need different bindings.

Optional environment overrides:
- `BEDROCK_MAX_OUTPUT_TOKENS` (default 512)
- `BEDROCK_TEMPERATURE` (default 0.2)
- `MCP_HOST` / `MCP_PORT`
- `MCP_DYNAMODB_TABLE_CONFIG` (semicolon-separated entries `table|partitionKey|sortKey|gsiName|gsiPartitionKey|gsiSortKey`)
- `MCP_CHAT_TABLE_NAME` (optional table selector when multiple entries are supplied)
- `TOOL_METRICS_EMIT_EMF` (set to `true` to emit CloudWatch Embedded Metric Format logs for tool calls)

## Frontend (Amplify-ready)

```bash
# from repo root
cp apps/frontend/.env.example apps/frontend/.env
# edit VITE_API_BASE_URL to point at your MCP service
# populate Cognito settings: VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_USER_POOL_CLIENT_ID
npm run dev:frontend           # start Vite dev server
npm run build:frontend         # production build (outputs to apps/frontend/dist)
```

Deploy with AWS Amplify Hosting by connecting this repo and keeping the generated `amplify.yml`. The build pipeline runs `npm ci` at the repo root and publishes `apps/frontend/dist`. Set `VITE_API_BASE_URL`, `VITE_COGNITO_REGION`, `VITE_COGNITO_USER_POOL_ID`, and `VITE_COGNITO_USER_POOL_CLIENT_ID` in Amplify’s environment settings.

Optional frontend flags:
- `VITE_CHAT_USE_STREAMING=true` enables the SSE-based `/chat/stream` endpoint so the UI can show live status updates while the assistant thinks.

### Chat API & persistence

The MCP server exposes a small REST surface alongside the `/chat` orchestrator endpoint:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | `POST` | Execute the next turn in a conversation. Accepts `{ message, sessionId?, messageId? }`. Returns `{ sessionId, reply, toolCalls }`. |
| `/chat/stream` | `POST` (SSE) | Same payload as `/chat`, but set `Accept: text/event-stream` to receive status and tool-call updates as Server-Sent Events. |
| `/conversations` | `GET` | List conversation summaries for the authenticated user. |
| `/conversations/:id/messages` | `GET` | Retrieve the full message history for a session (ordered by `createdAt`). |
| `/conversations/search` | `GET` | Search prior chat messages using a DynamoDB scan scoped to the authenticated user. |
| `/metrics` | `GET` | Prometheus text-format metrics (tool success/failure counters, retries, circuit state). |

External tool calls (SerpAPI, Wikipedia, arXiv) automatically retry with exponential backoff, short-term caching, and circuit breakers to soften upstream outages.

Chat history is stored in DynamoDB. Provide table metadata via `MCP_DYNAMODB_TABLE_CONFIG`, for example:

```
export MCP_DYNAMODB_TABLE_CONFIG="mcp-chat|sessionId|createdAt|userIndex|userId|lastMessageAt"
```

The table uses:
- **PK**: `sessionId`
- **SK**: ISO timestamp for messages, `__SUMMARY__` for the summary item
- **GSI (optional but recommended)**: `userIndex` on `userId` / `lastMessageAt` for listing conversations by user

Set `MCP_CHAT_TABLE_NAME` when multiple tables are defined and you need to select the chat store explicitly.

When you deploy via the provided CDK stack, leave `MCP_CREATE_CHAT_TABLE=true` to have the chat history table (and its `userIndex` GSI) created automatically. Use `MCP_CHAT_TABLE_NAME` if you need to control the physical table name; the stack wires both `MCP_DYNAMODB_TABLE_CONFIG` and `MCP_CHAT_TABLE_NAME` into the service task definition.

## Docker Image

```bash
cd mcp
docker build -t mcp-server .
```

## AWS Deployment (manual)

1. **Set deployment config**
   ```bash
   cd mcp/infrastructure
   cp .env.example .env
   # edit .env with your account ID, Cognito pool/client, Bedrock model, etc.
   ```
   Key variables:
   - `MCP_ACCOUNT_ID`, `MCP_REGION`
   - `MCP_COGNITO_USER_POOL_ID`, `MCP_COGNITO_USER_POOL_CLIENT_ID`
   - `MCP_BEDROCK_MODEL_ID` (defaults to `meta.llama3-8b-instruct-v1:0`)
   - `MCP_SERPAPI_SECRET_NAME` (Secrets Manager entry containing the SerpAPI key)
   - `MCP_DYNAMODB_TABLE_ARNS` (comma-separated DynamoDB table ARNs the service may read)
   - `MCP_DYNAMODB_TABLE_CONFIG` (semicolon-separated table descriptors `table|partitionKey|sortKey|gsiName|gsiPartitionKey|gsiSortKey`)
   - `MCP_CREATE_CHAT_TABLE` (defaults to `true`; set to `false` to skip provisioning the managed chat table)
   - `MCP_CHAT_TABLE_NAME` (optional explicit name when provisioning the managed chat table)
   - Optional: configure a custom domain directly in the App Runner console after deployment (not automated by this stack yet).

2. **Bootstrap (first time per account/region)**
  ```bash
  cd mcp/infrastructure
  npm install
   npx cdk bootstrap
   ```

3. **Create the SerpAPI secret (once)**
   ```bash
   aws secretsmanager create-secret \
     --name nexusnote/mcp/search-api \
     --secret-string "<YOUR_SERPAPI_KEY>"
   ```

4. **Deploy** – make sure Docker is running locally.
   ```bash
   cd mcp/infrastructure
   npm install        # safe to re-run
   npm run build      # compile CDK app
   npm run synth      # optional: inspect CloudFormation
   npm run deploy     # deploys the McpStack stack
   ```

   The deploy step builds a Docker image locally and provisions an App Runner service. If Docker isn’t running you’ll see `Cannot connect to the Docker daemon ...`. After a successful deploy, note the `ServiceHttpsUrl` output; use it for REST calls and replace the `https://` prefix with `wss://` when configuring WebSocket clients.

5. **Pause/resume to control cost (optional)**
   ```bash
   SERVICE_ARN=<AppRunnerServiceArn from outputs>
   aws apprunner pause-service --service-arn "$SERVICE_ARN"
   aws apprunner resume-service --service-arn "$SERVICE_ARN"
   ```
   App Runner bills only while the service is running. Pausing is the easiest way to keep the monthly cost under a dollar when you only need the tooling a few hours per month.

6. **Teardown (optional)**
   ```bash
   cd mcp/infrastructure
   npm run destroy
   ```

## Useful Commands Summary

| Purpose                      | Command(s) |
|------------------------------|------------|
| Local MCP dev                | `npm run dev` |
| Build MCP TypeScript         | `npm run build` |
| Start compiled MCP server    | `npm run start:websocket` |
| Frontend dev server          | `npm run dev:frontend` |
| Frontend production build    | `npm run build:frontend` |
| Build Docker image           | `docker build -t mcp-server .` |
| Deploy MCP infra to AWS      | `npm run build && npm run deploy` (from `infrastructure/`) |
| Destroy AWS stack            | `npm run destroy` (from `infrastructure/`) |
