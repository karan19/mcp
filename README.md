# MCP Server

MCP-compatible WebSocket server with a companion Amplify-ready React frontend. Use the commands below to run locally, build containers, or deploy to AWS.

## Local Development

```bash
cd mcp
npm install
export SERPAPI_KEY=<your-serpapi-key>
npm run dev            # hot-reload server
# npm run build        # compile to dist/
# npm run start:websocket   # run compiled output
```

The server listens on `0.0.0.0:8080`. Modify `src/config/env.ts` if you need different bindings.

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

1. **Set deployment config** – edit `infrastructure/bin/mcp-infra.ts`:
   - Replace `REPLACE_WITH_AWS_ACCOUNT_ID` with your AWS account ID.
   - Adjust CPU, memory, desired task count, or port in the `CONFIG` object if needed.
   - The stack expects a Secrets Manager entry named `nexusnote/mcp/search-api` that contains your SerpAPI key.

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
