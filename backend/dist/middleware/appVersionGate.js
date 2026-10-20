"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_VERSION_HEADER = void 0;
exports.isUnversionedClientBlockEnabled = isUnversionedClientBlockEnabled;
exports.unsupportedAppMessage = unsupportedAppMessage;
exports.parseAppVersionCode = parseAppVersionCode;
exports.requireVersionedAppClient = requireVersionedAppClient;
exports.APP_VERSION_HEADER = 'x-app-version';
/** Off unless APP_BLOCK_UNVERSIONED_CLIENTS=true — builds before 1.0.42 never send the version header. */
function isUnversionedClientBlockEnabled() {
    return process.env.APP_BLOCK_UNVERSIONED_CLIENTS?.trim().toLowerCase() === 'true';
}
function unsupportedAppMessage() {
    return (process.env.APP_BLOCK_UNVERSIONED_MESSAGE?.trim() ||
        'This version of Selecto is no longer supported. Please update the app from the Play Store.');
}
function parseAppVersionCode(raw) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    const n = Number(String(value).trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
/** Public endpoints hit by non-app callers (payment gateway, referral web page). */
const EXEMPT_PATHS = [/^\/wallet\/razorpay-webhook\/?$/, /^\/profile\/referral\/validate\//];
function requireVersionedAppClient(req, res, next) {
    if (!isUnversionedClientBlockEnabled() || req.method === 'OPTIONS') {
        next();
        return;
    }
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (EXEMPT_PATHS.some((re) => re.test(path))) {
        next();
        return;
    }
    if (parseAppVersionCode(req.headers[exports.APP_VERSION_HEADER]) != null) {
        next();
        return;
    }
    res.status(426).json({ message: unsupportedAppMessage(), error: 'APP_UPDATE_REQUIRED' });
}
