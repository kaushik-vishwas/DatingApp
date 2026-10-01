"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureServerError = captureServerError;
exports.captureServerMessage = captureServerMessage;
require("./config/bootstrapEnv");
const Sentry = __importStar(require("@sentry/node"));
const loadEnv_1 = require("./config/loadEnv");
const dsn = configuredDsn(process.env.SENTRY_DSN);
/** Placeholder values in .env stay disabled until a real project DSN is pasted in. */
function configuredDsn(raw) {
    const dsn = raw?.trim() || '';
    if (!dsn || dsn.includes('placeholder') || dsn.includes('o0.ingest.sentry.io/0'))
        return '';
    return dsn;
}
const SENSITIVE_KEY = /phone|otp|password|passwd|token|authorization|cookie|aadhaar|pan|bank|ifsc|upi|secret|signature|jwt|cvv|account|^config$|^headers$/i;
function scrubValue(value, depth = 0) {
    if (depth > 6)
        return '[truncated]';
    if (typeof value === 'string') {
        return value
            .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
            .replace(/\b\d{9,}\b/g, '[redacted]');
    }
    if (Array.isArray(value))
        return value.map((item) => scrubValue(item, depth + 1));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, nested] of Object.entries(value)) {
            out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : scrubValue(nested, depth + 1);
        }
        return out;
    }
    return value;
}
function scrubEvent(event) {
    if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
            event.request.headers = scrubValue(event.request.headers);
        }
    }
    if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
    }
    if (event.extra)
        event.extra = scrubValue(event.extra);
    if (event.contexts)
        event.contexts = scrubValue(event.contexts);
    if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
            ...crumb,
            data: crumb.data ? scrubValue(crumb.data) : crumb.data,
            message: typeof crumb.message === 'string' ? scrubValue(crumb.message) : crumb.message,
        }));
    }
    return event;
}
Sentry.init({
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: (0, loadEnv_1.getLoadedAppEnv)() ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    beforeSend(event) {
        return scrubEvent(event);
    },
});
function captureServerError(err, context) {
    if (!dsn)
        return;
    const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Server error');
    Sentry.withScope((scope) => {
        if (context?.area)
            scope.setTag('area', context.area);
        if (context?.handler)
            scope.setTag('handler', context.handler);
        if (context?.extra)
            scope.setContext('details', scrubValue(context.extra));
        Sentry.captureException(error);
    });
}
function captureServerMessage(message, context) {
    if (!dsn)
        return;
    Sentry.withScope((scope) => {
        scope.setLevel(context?.level ?? 'error');
        if (context?.area)
            scope.setTag('area', context.area);
        if (context?.handler)
            scope.setTag('handler', context.handler);
        if (context?.extra)
            scope.setContext('details', scrubValue(context.extra));
        Sentry.captureMessage(message);
    });
}
