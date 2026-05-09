"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_TRACE_HEADER = void 0;
exports.reuseOrCreateApiTrace = reuseOrCreateApiTrace;
exports.beginApiTrace = beginApiTrace;
exports.jsonWithTrace = jsonWithTrace;
exports.logProtectFailure = logProtectFailure;
exports.mongoErrCode = mongoErrCode;
const crypto_1 = __importDefault(require("crypto"));
exports.API_TRACE_HEADER = 'X-Api-Trace-Id';
/**
 * Start trace for one HTTP handler: sets response header, logs safe request outline, returns helpers.
 * Do not log passwords, OTPs, or raw bodies here.
 */
function readIncomingTrace(res) {
    const raw = res.getHeader(exports.API_TRACE_HEADER);
    if (typeof raw === 'string' && raw.trim())
        return raw.trim();
    if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim())
        return raw[0].trim();
    return undefined;
}
/** Reuse `protect` middleware trace id when present so logs align end-to-end. */
function reuseOrCreateApiTrace(res) {
    const existingTrace = readIncomingTrace(res);
    const traceId = existingTrace ?? crypto_1.default.randomUUID();
    if (!existingTrace)
        res.set(exports.API_TRACE_HEADER, traceId);
    return traceId;
}
function beginApiTrace(routeLabel, req, res) {
    const traceId = reuseOrCreateApiTrace(res);
    const tag = { traceId, route: routeLabel };
    const log = (stage, details) => {
        console.log('[api]', JSON.stringify({ ...tag, stage, ...(details ?? {}) }));
    };
    const warn = (stage, details) => {
        console.warn('[api]', JSON.stringify({ ...tag, stage, ...(details ?? {}) }));
    };
    const logFullError = (stage, err, extra) => {
        const e = err instanceof Error ? err : null;
        console.error('[api:error]', JSON.stringify({
            ...tag,
            stage,
            errMessage: e?.message ?? String(err),
            errName: e?.name,
            stack: e?.stack,
            ...(extra ?? {}),
        }));
    };
    const json = (status, body) => {
        res.status(status).json({ traceId, ...body });
    };
    log('request', {
        method: req.method,
        path: req.originalUrl ?? req.url,
        contentLengthHeader: req.get('content-length') ?? null,
        bodyKeys: req.body && typeof req.body === 'object' && !Array.isArray(req.body)
            ? Object.keys(req.body).sort()
            : [],
        authBearerPresent: typeof req.headers.authorization === 'string' &&
            req.headers.authorization.startsWith('Bearer '),
        userAgentSnippet: typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent'].slice(0, 200)
            : null,
    });
    return { traceId, routeLabel, log, warn, logFullError, json };
}
function jsonWithTrace(res, traceId, status, body) {
    res.status(status).json({ traceId, ...body });
}
function logProtectFailure(stage, details) {
    console.warn('[api:protect]', JSON.stringify({ stage, ...details }));
}
function mongoErrCode(err) {
    if (typeof err === 'object' && err !== null && 'code' in err) {
        const c = err.code;
        if (typeof c === 'string' || typeof c === 'number')
            return c;
    }
    return undefined;
}
