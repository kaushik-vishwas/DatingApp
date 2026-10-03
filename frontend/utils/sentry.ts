import type { ComponentType } from 'react';
import { NativeModules } from 'react-native';
import Constants from 'expo-constants';

type SentryModule = typeof import('@sentry/react-native');

function configuredDsn(raw: string | undefined): string {
  const dsn = raw?.trim() || '';
  if (!dsn || dsn.includes('placeholder') || dsn.includes('o0.ingest.sentry.io/0')) return '';
  return dsn;
}

const dsn =
  configuredDsn(process.env.EXPO_PUBLIC_SENTRY_DSN) ||
  configuredDsn(
    typeof Constants.expoConfig?.extra?.sentryDsn === 'string' ? Constants.expoConfig.extra.sentryDsn : ''
  );

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

/** Present only after a native build that includes @sentry/react-native. */
function loadSentry(): SentryModule | null {
  if (!NativeModules.RNSentry) return null;
  try {
    return require('@sentry/react-native') as SentryModule;
  } catch {
    return null;
  }
}

const SentrySdk = loadSentry();

if (SentrySdk) {
  SentrySdk.init({
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: __DEV__ ? 'development' : 'production',
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
}

export function setSentryUser(user: { id: string; role: string } | null): void {
  if (!SentrySdk || !dsn) return;
  if (!user) {
    SentrySdk.setUser(null);
    return;
  }
  SentrySdk.setUser({ id: user.id });
  SentrySdk.setTag('role', user.role);
}

/** Report unexpected client failures. Do not use for validation or offline errors. */
export function captureClientError(error: unknown, tags?: Record<string, string>): void {
  if (!SentrySdk || !dsn) return;
  SentrySdk.withScope((scope) => {
    if (tags) {
      for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
    }
    SentrySdk.captureException(error);
  });
}

export function wrapApp<T extends ComponentType<unknown>>(AppComponent: T): T {
  if (!SentrySdk) return AppComponent;
  return SentrySdk.wrap(AppComponent) as T;
}
