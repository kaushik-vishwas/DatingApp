import crypto from 'crypto';
import type { Request, Response } from 'express';

export const API_TRACE_HEADER = 'X-Api-Trace-Id';

export type ApiTrace = {
  traceId: string;
  routeLabel: string;
  /** Structured info lines (grep logs for `[api]`). */
  log: (stage: string, details?: Record<string, unknown>) => void;
  warn: (stage: string, details?: Record<string, unknown>) => void;
  /** Full error: message, name, stack; use for unexpected failures. */
  logFullError: (stage: string, err: unknown, extra?: Record<string, unknown>) => void;
  json: (status: number, body: Record<string, unknown>) => void;
};

/**
 * Start trace for one HTTP handler: sets response header, logs safe request outline, returns helpers.
 * Do not log passwords, OTPs, or raw bodies here.
 */
function readIncomingTrace(res: Response): string | undefined {
  const raw = res.getHeader(API_TRACE_HEADER);
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim();
  return undefined;
}

/** Reuse `protect` middleware trace id when present so logs align end-to-end. */
export function reuseOrCreateApiTrace(res: Response): string {
  const existingTrace = readIncomingTrace(res);
  const traceId = existingTrace ?? crypto.randomUUID();
  if (!existingTrace) res.set(API_TRACE_HEADER, traceId);
  return traceId;
}

export function beginApiTrace(routeLabel: string, req: Request, res: Response): ApiTrace {
  const traceId = reuseOrCreateApiTrace(res);

  const tag = { traceId, route: routeLabel };
  const log = (stage: string, details?: Record<string, unknown>) => {
    console.log('[api]', JSON.stringify({ ...tag, stage, ...(details ?? {}) }));
  };
  const warn = (stage: string, details?: Record<string, unknown>) => {
    console.warn('[api]', JSON.stringify({ ...tag, stage, ...(details ?? {}) }));
  };
  const logFullError = (stage: string, err: unknown, extra?: Record<string, unknown>) => {
    const e = err instanceof Error ? err : null;
    console.error(
      '[api:error]',
      JSON.stringify({
        ...tag,
        stage,
        errMessage: e?.message ?? String(err),
        errName: e?.name,
        stack: e?.stack,
        ...(extra ?? {}),
      })
    );
  };
  const json = (status: number, body: Record<string, unknown>) => {
    res.status(status).json({ traceId, ...body });
  };

  log('request', {
    method: req.method,
    path: req.originalUrl ?? req.url,
    contentLengthHeader: req.get('content-length') ?? null,
    bodyKeys:
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? Object.keys(req.body as object).sort()
        : [],
    authBearerPresent:
      typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer '),
    userAgentSnippet:
      typeof req.headers['user-agent'] === 'string'
        ? (req.headers['user-agent'] as string).slice(0, 200)
        : null,
  });

  return { traceId, routeLabel, log, warn, logFullError, json };
}

export function jsonWithTrace(res: Response, traceId: string, status: number, body: Record<string, unknown>): void {
  res.status(status).json({ traceId, ...body });
}

export function logProtectFailure(
  stage: string,
  details: Record<string, unknown> & { traceId?: string }
): void {
  console.warn('[api:protect]', JSON.stringify({ stage, ...details }));
}

export function mongoErrCode(err: unknown): string | number | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string' || typeof c === 'number') return c;
  }
  return undefined;
}
