type ToolStatus = 'success' | 'failure' | 'circuit_open';

interface ToolMetricRecord {
  counts: Record<ToolStatus, number>;
  durationMsSum: number;
  durationMsCount: number;
  retriesTotal: number;
  cacheHits: number;
  statusCodes: Map<number, number>;
}

const toolMetrics = new Map<string, ToolMetricRecord>();
const circuitState = new Map<string, boolean>();
const emitEmf = (process.env.TOOL_METRICS_EMIT_EMF ?? '').toLowerCase() === 'true';

/**
 * Retrieves or initialises the metric bucket for a tool. Using a helper keeps
 * the public API clean and ensures every code path records the same fields.
 */
function getMetricRecord(tool: string): ToolMetricRecord {
  let record = toolMetrics.get(tool);
  if (!record) {
    record = {
      counts: {
        success: 0,
        failure: 0,
        circuit_open: 0,
      },
      durationMsSum: 0,
      durationMsCount: 0,
      retriesTotal: 0,
      cacheHits: 0,
      statusCodes: new Map(),
    };
    toolMetrics.set(tool, record);
  }
  return record;
}

/**
 * Records the outcome of a tool invocation and, when enabled, emits the same
 * data as an Embedded Metric Format payload for CloudWatch ingestion.
 */
export function recordToolMetric(options: {
  tool: string;
  status: ToolStatus;
  durationMs: number;
  retries: number;
  statusCode?: number;
  cacheHit?: boolean;
}) {
  const record = getMetricRecord(options.tool);
  record.counts[options.status] += 1;
  if (options.status === 'success' || options.status === 'failure') {
    record.durationMsSum += options.durationMs;
    record.durationMsCount += 1;
    record.retriesTotal += options.retries;
    if (options.cacheHit) {
      record.cacheHits += 1;
    }
  }
  if (typeof options.statusCode === 'number') {
    const current = record.statusCodes.get(options.statusCode) ?? 0;
    record.statusCodes.set(options.statusCode, current + 1);
  }

  if (emitEmf) {
    emitEmbeddedMetric(options);
  }
}

/**
 * Emits an Embedded Metric Format JSON blob. Keeping this separate from
 * {@link recordToolMetric} keeps the hot path minimal when EMF is disabled.
 */
function emitEmbeddedMetric(options: {
  tool: string;
  status: ToolStatus;
  durationMs: number;
  retries: number;
  statusCode?: number;
  cacheHit?: boolean;
}) {
  const now = Date.now();
  const payload = {
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [
        {
          Namespace: 'McpTooling',
          Dimensions: [['ToolName']],
          Metrics: [
            { Name: 'Requests', Unit: 'Count' },
            { Name: 'DurationMs', Unit: 'Milliseconds' },
            { Name: 'Retries', Unit: 'Count' },
            { Name: 'CacheHit', Unit: 'Count' },
          ],
        },
      ],
    },
    ToolName: options.tool,
    Requests: 1,
    DurationMs: options.durationMs,
    Retries: options.retries,
    CacheHit: options.cacheHit ? 1 : 0,
    Status: options.status,
    StatusCode: options.statusCode ?? null,
  };
  console.log(JSON.stringify(payload));
}

/**
 * Tracks whether a tool's circuit breaker is open so the Prometheus exporter
 * can represent the state alongside normal request metrics.
 */
export function setCircuitState(tool: string, isOpen: boolean) {
  circuitState.set(tool, isOpen);
}

/**
 * Serialises all in-memory tool metrics to Prometheus exposition format. The
 * output is intentionally explicit rather than using a helper library to keep
 * the dependency surface minimal for the server environment.
 */
export function renderPrometheusMetrics(): string {
  const lines: string[] = [];
  lines.push('# HELP tool_request_total Count of tool invocations by status');
  lines.push('# TYPE tool_request_total counter');
  for (const [tool, record] of toolMetrics.entries()) {
    for (const status of Object.keys(record.counts) as ToolStatus[]) {
      const value = record.counts[status];
      lines.push(`tool_request_total{tool="${tool}",status="${status}"} ${value}`);
    }
  }

  lines.push('# HELP tool_request_duration_ms_sum Sum of tool request durations in milliseconds');
  lines.push('# TYPE tool_request_duration_ms_sum counter');
  for (const [tool, record] of toolMetrics.entries()) {
    lines.push(`tool_request_duration_ms_sum{tool="${tool}"} ${record.durationMsSum}`);
    lines.push(`tool_request_duration_ms_count{tool="${tool}"} ${record.durationMsCount}`);
  }

  lines.push('# HELP tool_request_retries_total Total retries attempted by tool');
  lines.push('# TYPE tool_request_retries_total counter');
  for (const [tool, record] of toolMetrics.entries()) {
    lines.push(`tool_request_retries_total{tool="${tool}"} ${record.retriesTotal}`);
  }

  lines.push('# HELP tool_cache_hits_total Number of cache hits per tool');
  lines.push('# TYPE tool_cache_hits_total counter');
  for (const [tool, record] of toolMetrics.entries()) {
    lines.push(`tool_cache_hits_total{tool="${tool}"} ${record.cacheHits}`);
  }

  lines.push('# HELP tool_request_status_code_total Count of responses per HTTP status code');
  lines.push('# TYPE tool_request_status_code_total counter');
  for (const [tool, record] of toolMetrics.entries()) {
    for (const [statusCode, value] of record.statusCodes.entries()) {
      lines.push(`tool_request_status_code_total{tool="${tool}",code="${statusCode}"} ${value}`);
    }
  }

  lines.push('# HELP tool_circuit_open Indicates whether the circuit breaker is open (1) or closed (0)');
  lines.push('# TYPE tool_circuit_open gauge');
  for (const [tool, isOpen] of circuitState.entries()) {
    lines.push(`tool_circuit_open{tool="${tool}"} ${isOpen ? 1 : 0}`);
  }

  if (!circuitState.size) {
    for (const tool of toolMetrics.keys()) {
      lines.push(`tool_circuit_open{tool="${tool}"} 0`);
    }
  }

  return `${lines.join('\n')}\n`;
}
