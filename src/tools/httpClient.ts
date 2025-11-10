import type { ToolContext } from './types';
import { recordToolMetric, setCircuitState } from '../metrics/toolMetrics';

interface ResilienceOptions {
  maxAttempts?: number;
  timeoutMs?: number;
  initialRetryDelayMs?: number;
  failureThreshold?: number;
  cooldownMs?: number;
  cacheKey?: string;
  cacheTtlMs?: number;
  serveStaleOnError?: boolean;
}

interface RequestFactory {
  (signal: AbortSignal): Promise<Response>;
}

interface CacheEntry {
  status: number;
  headers: [string, string][];
  body: string;
  expiresAt: number;
  lastSuccessfulAt: number;
}

class CircuitBreaker {
  private failureCount = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private nextAttemptTime = 0;

  constructor(
    private readonly toolName: string,
    private readonly threshold: number,
    private readonly cooldownMs: number
  ) {}

  allowRequest(): boolean {
    if (this.state === 'open') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'half_open';
        setCircuitState(this.toolName, false);
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state !== 'closed') {
      this.state = 'closed';
      setCircuitState(this.toolName, false);
    }
  }

  recordFailure() {
    this.failureCount += 1;
    if (this.failureCount >= this.threshold && this.state !== 'open') {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.cooldownMs;
      setCircuitState(this.toolName, true);
    }
  }
}

const breakerMap = new Map<string, CircuitBreaker>();
const responseCache = new Map<string, CacheEntry>();

function getCircuitBreaker(toolName: string, options: ResilienceOptions): CircuitBreaker {
  let breaker = breakerMap.get(toolName);
  if (!breaker) {
    breaker = new CircuitBreaker(
      toolName,
      options.failureThreshold ?? 5,
      options.cooldownMs ?? 30_000
    );
    breakerMap.set(toolName, breaker);
  }
  return breaker;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeBackoff(baseDelay: number, attempt: number) {
  const jitter = Math.random() * 100;
  return baseDelay * 2 ** (attempt - 1) + jitter;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === 'AbortError') {
    return true;
  }
  const message = error.message.toLowerCase();
  return message.includes('network') || message.includes('fetch');
}

async function readBodySnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return '';
  }
}

export async function performToolFetch(
  toolName: string,
  logger: ToolContext['logger'],
  requestFactory: RequestFactory,
  options: ResilienceOptions = {}
): Promise<Response> {
  const breaker = getCircuitBreaker(toolName, options);
  if (!breaker.allowRequest()) {
    recordToolMetric({
      tool: toolName,
      status: 'circuit_open',
      durationMs: 0,
      retries: 0,
    });
    throw new Error(`${toolName} is temporarily unavailable. Please try again later.`);
  }

  if (options.cacheKey) {
    const cached = responseCache.get(options.cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      recordToolMetric({
        tool: toolName,
        status: 'success',
        durationMs: 0,
        retries: 0,
        cacheHit: true,
      });
      return buildResponseFromCache(cached);
    }
    if (cached && cached.expiresAt <= Date.now()) {
      responseCache.delete(options.cacheKey);
    }
  }

  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const baseDelay = options.initialRetryDelayMs ?? 300;
  const startTime = Date.now();
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const response = await requestFactory(abortController.signal);
        clearTimeout(timeout);

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status) && attempt < maxAttempts;
        const bodySnippet = await readBodySnippet(response);

        if (retryable) {
          logger.warn(
            { tool: toolName, status: response.status, attempt },
            'Tool HTTP request failed, retrying'
          );
          await delay(computeBackoff(baseDelay, attempt));
          continue;
        }

        breaker.recordFailure();
        recordToolMetric({
          tool: toolName,
          status: 'failure',
          durationMs: Date.now() - startTime,
          retries: attempt - 1,
          statusCode: response.status,
        });

        throw new Error(
          `${toolName} request failed with status ${response.status}${bodySnippet ? `: ${bodySnippet}` : ''}`
        );
      }

      let clonedResponse = response;
      if (options.cacheKey && options.cacheTtlMs) {
        const cloned = response.clone();
        const bodyText = await cloned.text();
        cacheResponse(options.cacheKey, {
          status: response.status,
          headers: Array.from(response.headers.entries()),
          body: bodyText,
          expiresAt: Date.now() + options.cacheTtlMs,
          lastSuccessfulAt: Date.now(),
        });
        clonedResponse = new Response(bodyText, {
          status: response.status,
          headers: response.headers,
        });
      }

      breaker.recordSuccess();
      recordToolMetric({
        tool: toolName,
        status: 'success',
        durationMs: Date.now() - startTime,
        retries: attempt - 1,
        statusCode: response.status,
        cacheHit: false,
      });
      return clonedResponse;
    } catch (error) {
      clearTimeout(timeout);
      const retryable = isRetryableError(error) && attempt < maxAttempts;
      if (retryable) {
        logger.warn({ tool: toolName, attempt, err: error }, 'Tool HTTP request threw, retrying');
        await delay(computeBackoff(baseDelay, attempt));
        continue;
      }

      breaker.recordFailure();
      recordToolMetric({
        tool: toolName,
        status: 'failure',
        durationMs: Date.now() - startTime,
        retries: attempt - 1,
        cacheHit: false,
      });

      if (options.cacheKey && options.serveStaleOnError) {
        const cached = responseCache.get(options.cacheKey);
        if (cached) {
          recordToolMetric({
            tool: toolName,
            status: 'success',
            durationMs: 0,
            retries: attempt - 1,
            cacheHit: true,
          });
          return buildResponseFromCache(cached, true);
        }
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  // Should not reach here because loop either returns or throws
  breaker.recordFailure();
  recordToolMetric({
    tool: toolName,
    status: 'failure',
    durationMs: Date.now() - startTime,
    retries: maxAttempts - 1,
    cacheHit: false,
  });
  throw new Error(`${toolName} request failed after ${maxAttempts} attempts.`);
}

function cacheResponse(key: string, entry: CacheEntry) {
  responseCache.set(key, entry);
}

function buildResponseFromCache(entry: CacheEntry, stale = false): Response {
  const headers = new Headers(entry.headers);
  if (stale) {
    headers.set('x-cache-status', 'stale');
    headers.set('x-cache-age', `${Math.max(0, Math.floor((Date.now() - entry.lastSuccessfulAt) / 1000))}`);
  } else {
    headers.set('x-cache-status', 'hit');
  }
  return new Response(entry.body, {
    status: entry.status,
    headers,
  });
}
