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
- `MCP_DYNAMODB_TABLE_CONFIG` (semicolon-separated list such as `table|partitionKey|sortKey`)

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
   - `MCP_DYNAMODB_TABLE_CONFIG` (semicolon-separated table descriptors `table|partitionKey|sortKey`)
   - Optional custom domain settings (`MCP_API_DOMAIN_NAME`, `MCP_HOSTED_ZONE_DOMAIN_NAME`, `MCP_CERTIFICATE_ARN`)

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

   The deploy step builds a Docker image locally. If Docker isn’t running you’ll see `Cannot connect to the Docker daemon ...`. After a successful deploy, note the load balancer DNS name; the WebSocket endpoint is `ws://<ALB-DNS>:8080` unless you changed the port.

5. **Teardown (optional)**
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
