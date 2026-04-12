"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
/**
 * JWT authentication middleware for protected routes.
 * Expects: Authorization: Bearer <token>
 * Token payload must include `typ`: `u` (app user) or `r` (receiver).
 */
const protect = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (decoded.typ !== 'u' && decoded.typ !== 'r') {
            res.status(401).json({ message: 'Invalid session. Please sign in again.' });
            return;
        }
        if (decoded.typ === 'u') {
            const user = await User_1.default.findById(decoded.id).select('-otp -otpExpiry -passwordHash');
            if (!user) {
                res.status(401).json({ message: 'User not found' });
                return;
            }
            if (user.suspended) {
                res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
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
            res.status(401).json({ message: 'User not found' });
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
            res.status(401).json({ message: 'Not authorized, invalid token' });
            return;
        }
        next(err);
    }
};
exports.protect = protect;
