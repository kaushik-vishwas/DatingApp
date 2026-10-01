import * as Sentry from '@sentry/react';

function configuredDsn(raw: string | undefined): string {
  const dsn = raw?.trim() || '';
  if (!dsn || dsn.includes('placeholder') || dsn.includes('o0.ingest.sentry.io/0')) return '';
  return dsn;
}

const dsn = configuredDsn(import.meta.env.VITE_SENTRY_DSN);

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

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: import.meta.env.MODE || 'development',
  tracesSampleRate: 0,
  beforeSend(event) {
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
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        data: crumb.data ? (scrubValue(crumb.data) as Record<string, unknown>) : crumb.data,
        message: typeof crumb.message === 'string' ? (scrubValue(crumb.message) as string) : crumb.message,
      }));
    }
    return event;
  },
});

export function setSentryAdmin(admin: { id: string; role: string } | null): void {
  if (!dsn) return;
  if (!admin) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: admin.id });
  Sentry.setTag('role', admin.role);
}

export function captureAdminError(error: unknown, tags?: Record<string, string>): void {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    if (tags) {
      for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
    }
    Sentry.captureException(error);
  });
}

export { Sentry };
