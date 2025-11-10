const FALLBACK_API_BASE_URL = 'http://localhost:8080';

function resolveEnvVar(name: string) {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === 'string' ? value : undefined;
}

function requiredEnv(name: string) {
  const value = resolveEnvVar(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveBooleanEnv(name: string, fallback: boolean) {
  const value = resolveEnvVar(name);
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return fallback;
}

export const appConfig = {
  apiBaseUrl: resolveEnvVar('VITE_API_BASE_URL') ?? FALLBACK_API_BASE_URL,
  cognitoRegion: requiredEnv('VITE_COGNITO_REGION'),
  cognitoUserPoolId: requiredEnv('VITE_COGNITO_USER_POOL_ID'),
  cognitoUserPoolClientId: requiredEnv('VITE_COGNITO_USER_POOL_CLIENT_ID'),
  chatStreamingEnabled: resolveBooleanEnv('VITE_CHAT_USE_STREAMING', false),
};
