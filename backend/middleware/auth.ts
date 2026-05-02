import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Receiver from '../models/Receiver';
import { getPayloadSessionVersion, type AppJwtPayload } from '../utils/authToken';

/**
 * JWT authentication middleware for protected routes.
 * Expects: Authorization: Bearer <token>
 * Token payload must include `typ`: `u` (app user) or `r` (receiver).
 */
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Not authorized, no token' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ message: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, secret) as AppJwtPayload;
    if (decoded.typ !== 'u' && decoded.typ !== 'r') {
      res.status(401).json({ message: 'Invalid session. Please sign in again.' });
      return;
    }

    const tokenSv = getPayloadSessionVersion(decoded);

    if (decoded.typ === 'u') {
      const user = await User.findById(decoded.id).select('-otp -otpExpiry -passwordHash');
      if (!user) {
        res.status(401).json({ message: 'User not found' });
        return;
      }
      const dbSv = typeof user.authSessionVersion === 'number' ? user.authSessionVersion : 0;
      if (tokenSv !== dbSv) {
        res.status(401).json({ message: 'Signed in on another device. Please sign in again.' });
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
      res.status(401).json({ message: 'User not found' });
      return;
    }
    const dbSvR = typeof receiver.authSessionVersion === 'number' ? receiver.authSessionVersion : 0;
    if (tokenSv !== dbSvR) {
      res.status(401).json({ message: 'Signed in on another device. Please sign in again.' });
      return;
    }
    req.user = undefined;
    req.receiver = receiver as any;
    req.accountKind = 'receiver';
    next();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Not authorized, invalid token' });
      return;
    }
    next(err);
  }
};
