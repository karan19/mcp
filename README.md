# MCP Server

Small MCP-compatible WebSocket server with tools for web, Wikipedia, arXiv, and AWS Docs search. Use the commands below to run locally, build a container, or deploy to AWS.

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

| Purpose              | Command(s) |
|----------------------|------------|
| Local dev            | `npm run dev` |
| Build TypeScript     | `npm run build` |
| Start compiled server| `npm run start:websocket` |
| Build Docker image   | `docker build -t mcp-server .` |
| Deploy to AWS        | `npm run build && npm run deploy` (from `infrastructure/`) |
| Destroy AWS stack    | `npm run destroy` (from `infrastructure/`) |
