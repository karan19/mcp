# NexusNote Chat Frontend

React + TypeScript single-page app that provides a ChatGPT-style UI backed by the MCP server.

## Features
- Cognito-powered email/password sign-in reusing the NexusNote user pool.
- Authenticated chat workspace with streaming-ready layout.
- Chat orchestration hook that posts to `POST /chat`, attaches the Cognito ID token, and renders assistant responses.
- Amplify Hosting configuration via `amplify.yml`.

## Local Development
```bash
cp .env.example .env
npm install            # from repo root installs all workspaces
npm run dev:frontend   # Vite dev server on http://localhost:5173
```

Environment variables:

```
VITE_API_BASE_URL             # MCP server base URL (default http://localhost:8080)
VITE_COGNITO_REGION           # e.g. us-east-1
VITE_COGNITO_USER_POOL_ID     # existing NexusNote user pool id
VITE_COGNITO_USER_POOL_CLIENT_ID  # app client configured for this frontend
```

Update `.env` for local overrides or supply them in Amplify.

## Building
```bash
npm run build:frontend
```
Build artifacts land in `apps/frontend/dist`.

## Amplify Hosting
- Connect the repository in the Amplify console.
- Leave the default build settings (they read `amplify.yml` at the repo root).
- Configure `VITE_API_BASE_URL`, `VITE_COGNITO_REGION`, `VITE_COGNITO_USER_POOL_ID`, and `VITE_COGNITO_USER_POOL_CLIENT_ID` in Amplify’s environment settings before deploying.
