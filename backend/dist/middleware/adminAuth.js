"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminProtect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Admin_1 = __importDefault(require("../models/Admin"));
const adminProtect = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (decoded.typ !== 'admin' || !decoded.adminId) {
            res.status(401).json({ message: 'Not authorized, invalid token' });
            return;
        }
        const admin = await Admin_1.default.findById(decoded.adminId).select('-passwordHash');
        if (!admin) {
            res.status(401).json({ message: 'Admin not found' });
            return;
        }
        req.admin = admin;
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
exports.adminProtect = adminProtect;
