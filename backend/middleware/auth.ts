import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Receiver from '../models/Receiver';
import { getPayloadSessionVersion, type AppJwtPayload } from '../utils/authToken';
import { API_TRACE_HEADER, logProtectFailure } from '../utils/apiTraceLog';

/**
 * JWT authentication middleware for protected routes.
 * Expects: Authorization: Bearer <token>
 * Token payload must include `typ`: `u` (app user) or `r` (receiver).
 */
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const traceId = crypto.randomUUID();
  res.set(API_TRACE_HEADER, traceId);

  const failStatus = (
    status: number,
    body: Record<string, unknown>,
    logStage: string,
    extra?: Record<string, unknown>
  ): void => {
    logProtectFailure(logStage, {
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

    const decoded = jwt.verify(token, secret) as AppJwtPayload;
    if (decoded.typ !== 'u' && decoded.typ !== 'r') {
      failStatus(
        401,
        { message: 'Invalid session. Please sign in again.', error: 'PROTECT_INVALID_TOKEN_TYP' },
        'invalid_typ',
        {}
      );
      return;
    }

    const tokenSv = getPayloadSessionVersion(decoded);

    if (decoded.typ === 'u') {
      const user = await User.findById(decoded.id).select('-otp -otpExpiry -passwordHash');
      if (!user) {
        failStatus(
          401,
          { message: 'User not found', error: 'PROTECT_USER_NOT_FOUND' },
          'user_not_found'
        );
        return;
      }
      const dbSv = typeof user.authSessionVersion === 'number' ? user.authSessionVersion : 0;
      if (tokenSv !== dbSv) {
        failStatus(
          401,
          { message: 'Signed in on another device. Please sign in again.', error: 'PROTECT_SESSION_SUPERSEDED' },
          'user_session_superseded',
          { decodedIdSuffix: String(decoded.id).slice(-6) }
        );
        return;
      }
      req.user = user as any;
      req.receiver = undefined;
      req.accountKind = 'user';
      next();
      return;
    }

    const receiver = await Receiver.findById(decoded.id).select('-otp -otpExpiry -passwordHash');
    if (!receiver) {
      failStatus(
        401,
        { message: 'User not found', error: 'PROTECT_RECEIVER_NOT_FOUND' },
        'receiver_not_found'
      );
      return;
    }
    const dbSvR = typeof receiver.authSessionVersion === 'number' ? receiver.authSessionVersion : 0;
    if (tokenSv !== dbSvR) {
      failStatus(
        401,
        { message: 'Signed in on another device. Please sign in again.', error: 'PROTECT_SESSION_SUPERSEDED' },
        'receiver_session_superseded',
        { decodedIdSuffix: String(decoded.id).slice(-6) }
      );
      return;
    }
    req.user = undefined;
    req.receiver = receiver as any;
    req.accountKind = 'receiver';
    next();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
      const isExpired = name === 'TokenExpiredError';
      console.warn(
        '[api:protect]',
        JSON.stringify({
          stage: isExpired ? 'jwt_expired' : 'jwt_invalid',
          traceId,
          path: req.originalUrl ?? req.url,
          errName: name,
        })
      );
      failStatus(
        401,
        {
          message: 'Not authorized, invalid token',
          error: isExpired ? 'PROTECT_JWT_EXPIRED' : 'PROTECT_JWT_INVALID',
        },
        isExpired ? 'jwt_expired' : 'jwt_invalid',
        { errName: name }
      );
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      '[api:protect:error]',
      JSON.stringify({ traceId, path: req.originalUrl ?? req.url, message: msg, stack: err instanceof Error ? err.stack : undefined })
    );
    next(err);
  }
};
