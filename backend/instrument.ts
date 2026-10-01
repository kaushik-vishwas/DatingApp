import './config/bootstrapEnv';
import * as Sentry from '@sentry/node';
import { getLoadedAppEnv } from './config/loadEnv';

const dsn = configuredDsn(process.env.SENTRY_DSN);

/** Placeholder values in .env stay disabled until a real project DSN is pasted in. */
function configuredDsn(raw: string | undefined): string {
  const dsn = raw?.trim() || '';
  if (!dsn || dsn.includes('placeholder') || dsn.includes('o0.ingest.sentry.io/0')) return '';
  return dsn;
}

const SENSITIVE_KEY =
  /phone|otp|password|passwd|token|authorization|cookie|aadhaar|pan|bank|ifsc|upi|secret|signature|jwt|cvv|account|^config$|^headers$/i;

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
      .replace(/\b\d{9,}\b/g, '[redacted]');
  }
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : scrubValue(nested, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      event.request.headers = scrubValue(event.request.headers) as Record<string, string>;
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as Sentry.ErrorEvent['contexts'];
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: crumb.data ? (scrubValue(crumb.data) as Record<string, unknown>) : crumb.data,
      message: typeof crumb.message === 'string' ? (scrubValue(crumb.message) as string) : crumb.message,
    }));
  }
  return event;
}

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: getLoadedAppEnv() ?? process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0,
  beforeSend(event) {
    return scrubEvent(event);
  },
});

type ServerErrorContext = {
  area: string;
  handler?: string;
  extra?: Record<string, unknown>;
};

export function captureServerError(err: unknown, context?: ServerErrorContext): void {
  if (!dsn) return;
  const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Server error');
  Sentry.withScope((scope) => {
    if (context?.area) scope.setTag('area', context.area);
    if (context?.handler) scope.setTag('handler', context.handler);
    if (context?.extra) scope.setContext('details', scrubValue(context.extra) as Record<string, unknown>);
    Sentry.captureException(error);
  });
}

export function captureServerMessage(
  message: string,
  context?: ServerErrorContext & { level?: Sentry.SeverityLevel }
): void {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    scope.setLevel(context?.level ?? 'error');
    if (context?.area) scope.setTag('area', context.area);
    if (context?.handler) scope.setTag('handler', context.handler);
    if (context?.extra) scope.setContext('details', scrubValue(context.extra) as Record<string, unknown>);
    Sentry.captureMessage(message);
  });
}
