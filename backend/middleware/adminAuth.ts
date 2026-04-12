import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import Admin, { type AdminDocument } from '../models/Admin';

type AdminJwtPayload = { adminId: string; typ: 'admin' };

export const adminProtect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Not authorized, no token' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      res.status(500).json({ message: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, secret) as AdminJwtPayload;
    if (decoded.typ !== 'admin' || !decoded.adminId) {
      res.status(401).json({ message: 'Not authorized, invalid token' });
      return;
    }

    const admin = await Admin.findById(decoded.adminId).select('-passwordHash');
    if (!admin) {
      res.status(401).json({ message: 'Admin not found' });
      return;
    }

    req.admin = admin as AdminDocument;
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
