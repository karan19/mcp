Local Deployment And Testing
============================

Prerequisites
-------------
- Node.js 20+
- npm
- SerpAPI key

Install Dependencies
--------------------
1. cd mcp
2. npm install

Set SerpAPI Key
---------------
1. export SERPAPI_KEY=<your-serpapi-key>

Set Authentication And AI Environment
-------------------------------------
1. export COGNITO_REGION=<aws-region>
2. export COGNITO_USER_POOL_ID=<user-pool-id>
3. export COGNITO_USER_POOL_CLIENT_ID=<app-client-id>
4. export BEDROCK_REGION=<aws-region>
5. export BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
6. (optional) export BEDROCK_MAX_OUTPUT_TOKENS=512
7. (optional) export BEDROCK_TEMPERATURE=0.2

Start The Server (hot reload)
-----------------------------
1. npm run dev

Start The Server (compiled)
---------------------------
1. npm run build
2. npm run start:websocket

Exercise MCP Tools
------------------
1. Install a WebSocket client (for example: npm install -g wscat).
2. wscat -c ws://localhost:8080/
3. Send a list_tools request:
   {"type":"list_tools","requestId":"1"}
4. Call the Wikipedia search tool:
   {"type":"call_tool","requestId":"2","toolName":"search.wikipedia","arguments":{"query":"Anthropic Claude","language":"en","numResults":2}}

Frontend Smoke Test
-------------------
1. Copy `apps/frontend/.env.example` to `.env` and set Cognito env vars (region, user pool id, app client id) plus `VITE_API_BASE_URL`.
2. npm run dev:frontend
3. Open http://localhost:5173/
4. Sign in with a valid NexusNote Cognito username/password.
5. Send a chat prompt and verify the answer cites tool output (e.g., references Wikipedia when that tool is invoked).

Shut Down
---------
- Stop the Node process with Ctrl+C.
- Stop the Vite dev server with Ctrl+C.

Notes
-----
- The server listens on ws://localhost:8080/.
