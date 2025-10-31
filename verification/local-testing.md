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
4. Send call_tool requests (examples):
   {"type":"call_tool","requestId":"2","toolName":"search.web","arguments":{"query":"aws re:Invent 2024","numResults":3}}
   {"type":"call_tool","requestId":"3","toolName":"search.wikipedia","arguments":{"query":"Anthropic Claude","language":"en","numResults":2}}
   {"type":"call_tool","requestId":"4","toolName":"search.arxiv","arguments":{"query":"transformer architecture","maxResults":2}}
   {"type":"call_tool","requestId":"5","toolName":"search.aws_docs","arguments":{"query":"ecs fargate logging","numResults":3}}

Shut Down
---------
- Stop the Node process with Ctrl+C.

Notes
-----
- The server listens on ws://localhost:8080/.
- `search.aws_docs` currently returns an upstream 404 because the AWS docs JSON endpoint has changed.
