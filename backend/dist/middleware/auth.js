"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const authToken_1 = require("../utils/authToken");
const apiTraceLog_1 = require("../utils/apiTraceLog");
/**
 * JWT authentication middleware for protected routes.
 * Expects: Authorization: Bearer <token>
 * Token payload must include `typ`: `u` (app user) or `r` (receiver).
 */
const protect = async (req, res, next) => {
    const traceId = crypto_1.default.randomUUID();
    res.set(apiTraceLog_1.API_TRACE_HEADER, traceId);
    const failStatus = (status, body, logStage, extra) => {
        (0, apiTraceLog_1.logProtectFailure)(logStage, {
            traceId,
            status,
            path: req.originalUrl ?? req.url,
            method: req.method,
            ...extra,
        });
        res.status(status).json({ traceId, ...body });
    };
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            failStatus(401, { message: 'Not authorized, no token', error: 'PROTECT_NO_BEARER' }, 'no_bearer');
            return;
        }
        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('[api:protect]', JSON.stringify({ traceId, stage: 'jwt_secret_missing' }));
            res.status(500).json({
                traceId,
                message: 'Server configuration error',
                error: 'PROTECT_JWT_SECRET_MISSING',
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (decoded.typ !== 'u' && decoded.typ !== 'r') {
            failStatus(401, { message: 'Invalid session. Please sign in again.', error: 'PROTECT_INVALID_TOKEN_TYP' }, 'invalid_typ', {});
            return;
        }
        const tokenSv = (0, authToken_1.getPayloadSessionVersion)(decoded);
        if (decoded.typ === 'u') {
            const user = await User_1.default.findById(decoded.id).select('-otp -otpExpiry -passwordHash');
            if (!user) {
                failStatus(401, { message: 'User not found', error: 'PROTECT_USER_NOT_FOUND' }, 'user_not_found');
                return;
            }
            const dbSv = typeof user.authSessionVersion === 'number' ? user.authSessionVersion : 0;
            if (tokenSv !== dbSv) {
                failStatus(401, { message: 'Signed in on another device. Please sign in again.', error: 'PROTECT_SESSION_SUPERSEDED' }, 'user_session_superseded', { decodedIdSuffix: String(decoded.id).slice(-6) });
                return;
            }
            req.user = user;
            req.receiver = undefined;
            req.accountKind = 'user';
            next();
            return;
        }
        const receiver = await Receiver_1.default.findById(decoded.id).select('-otp -otpExpiry -passwordHash');
        if (!receiver) {
            failStatus(401, { message: 'User not found', error: 'PROTECT_RECEIVER_NOT_FOUND' }, 'receiver_not_found');
            return;
        }
        const dbSvR = typeof receiver.authSessionVersion === 'number' ? receiver.authSessionVersion : 0;
        if (tokenSv !== dbSvR) {
            failStatus(401, { message: 'Signed in on another device. Please sign in again.', error: 'PROTECT_SESSION_SUPERSEDED' }, 'receiver_session_superseded', { decodedIdSuffix: String(decoded.id).slice(-6) });
            return;
        }
        req.user = undefined;
        req.receiver = receiver;
        req.accountKind = 'receiver';
        next();
    }
    catch (err) {
        const name = err instanceof Error ? err.name : 'Error';
        if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
            const isExpired = name === 'TokenExpiredError';
            console.warn('[api:protect]', JSON.stringify({
                stage: isExpired ? 'jwt_expired' : 'jwt_invalid',
                traceId,
                path: req.originalUrl ?? req.url,
                errName: name,
            }));
            failStatus(401, {
                message: 'Not authorized, invalid token',
                error: isExpired ? 'PROTECT_JWT_EXPIRED' : 'PROTECT_JWT_INVALID',
            }, isExpired ? 'jwt_expired' : 'jwt_invalid', { errName: name });
            return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[api:protect:error]', JSON.stringify({ traceId, path: req.originalUrl ?? req.url, message: msg, stack: err instanceof Error ? err.stack : undefined }));
        next(err);
    }
};
exports.protect = protect;
