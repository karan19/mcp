export interface EnvConfig {
  host: string;
  port: number;
}

export function loadEnvConfig(): EnvConfig {
  return {
    host: '0.0.0.0',
    port: 8080,
  };
}
