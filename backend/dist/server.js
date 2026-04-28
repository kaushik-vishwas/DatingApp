"use strict";
// import './config/bootstrapEnv';
// import http from 'http';
// import express from 'express';
// import cors from 'cors';
// import connectDB from './config/database';
// import { verifyEmailConfig } from './config/email';
// import { syncSuperAdminFromEnv } from './services/superAdminSync';
// import authRoutes from './routes/authRoutes';
// import profileRoutes from './routes/profileRoutes';
// import adminRoutes from './routes/adminRoutes';
// import discoverRoutes from './routes/discoverRoutes';
// import walletRoutes from './routes/walletRoutes';
// import chatRoutes from './routes/chatRoutes';
// import callRoutes from './routes/callRoutes';
// import { attachChatSocket } from './socket/chatSocket';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// const app = express();
// const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
// // app.use(cors());
// // app.use(cors({
// //   origin: [
// //     'http://localhost:3000',
// //     'http://localhost:5173', // vite dev
// //     'https://dating-admin-mocha.vercel.app',
// //     'https://dating-app-drab-omega.vercel.app',
// //     'https://backend.nesthamapp.com',
// //     'https://nesthamapp.com'
// //   ],
// //   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
// //   credentials: true
// // }));
// app.use(cors({
//   origin: true, // reflect any origin
//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
//   credentials: true
// }));
// app.use(express.json());
// app.use((req, res, next) => {
//   console.log("URL:", req.method, req.url);
//   console.log("BODY:", req.body);
//   next();
// });
// // Health check
// app.get('/health', (_req, res) => {
//   res.json({ ok: true });
// });
// // Auth routes mounted at /auth
// app.use('/auth', authRoutes);
// app.use('/profile', profileRoutes);
// app.use('/discover', discoverRoutes);
// app.use('/wallet', walletRoutes);
// app.use('/admin', adminRoutes);
// app.use('/chat', chatRoutes);
// app.use('/calls', callRoutes);
// const httpServer = http.createServer(app);
// void attachChatSocket(httpServer);
// // 404
// app.use((_req, res) => {
//   res.status(404).json({ message: 'Not found' });
// });
// // Error handler
// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
//   const msg = err instanceof Error ? err.message : String(err);
//   // Avoid leaking secrets; send a generic message but log details
//   console.error(err);
//   res.status(500).json({ message: msg || 'Internal server error' });
// });
// const start = async (): Promise<void> => {
//   await connectDB();
//   await syncSuperAdminFromEnv();
//   void verifyEmailConfig().then((r) => {
//     if (!r.ok && process.env.OTP_BYPASS?.toLowerCase() !== 'true') {
//       console.warn('[email] OTP mail may fail until SMTP is fixed:', r.error);
//     }
//   });
//   httpServer.listen(PORT, '0.0.0.0', () => {
//     console.log(`Server listening on port ${PORT} (reachable at http://localhost:${PORT} and your LAN IP)`);
//   });
// };
// void start();
// LOAD ENV
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const envCandidates = [
    path_1.default.resolve(process.cwd(), '.env'),
    path_1.default.resolve(__dirname, '../.env'),
    path_1.default.resolve(__dirname, '../../.env'),
];
const envPath = envCandidates.find((candidate) => fs_1.default.existsSync(candidate));
if (envPath) {
    console.log('Loading .env from:', envPath);
    const result = dotenv_1.default.config({ path: envPath });
    if (result.error) {
        console.error('Error loading .env:', result.error);
    }
    else {
        console.log('✅ .env loaded successfully');
    }
}
else {
    // In production, env vars are often injected by PM2/systemd/container runtime.
    console.warn('⚠️ No .env file found. Continuing with existing process environment variables.');
}
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ SET' : '❌ NOT SET');
// Normal imports
require("./config/bootstrapEnv");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const email_1 = require("./config/email");
const superAdminSync_1 = require("./services/superAdminSync");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const discoverRoutes_1 = __importDefault(require("./routes/discoverRoutes"));
const walletRoutes_1 = __importDefault(require("./routes/walletRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const callRoutes_1 = __importDefault(require("./routes/callRoutes"));
const chatSocket_1 = require("./socket/chatSocket");
const app = (0, express_1.default)();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.use((0, cors_1.default)({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}));
app.use(express_1.default.json());
app.use((req, res, next) => {
    console.log("URL:", req.method, req.url);
    console.log("BODY:", req.body);
    next();
});
// Health check
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// Auth routes
app.use('/auth', authRoutes_1.default);
app.use('/profile', profileRoutes_1.default);
app.use('/discover', discoverRoutes_1.default);
app.use('/wallet', walletRoutes_1.default);
app.use('/admin', adminRoutes_1.default);
app.use('/chat', chatRoutes_1.default);
app.use('/calls', callRoutes_1.default);
const httpServer = http_1.default.createServer(app);
void (0, chatSocket_1.attachChatSocket)(httpServer);
// 404
app.use((_req, res) => {
    res.status(404).json({ message: 'Not found' });
});
// Error handler
app.use((err, _req, res, _next) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    res.status(500).json({ message: msg || 'Internal server error' });
});
const start = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not set');
        }
        console.log('Attempting to connect to MongoDB...');
        console.log('Using SRV resolution (let Node.js resolve normally)');
        await mongoose_1.default.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            family: 4, // Force IPv4
        });
        console.log('✅ MongoDB connected successfully');
        await (0, superAdminSync_1.syncSuperAdminFromEnv)();
        void (0, email_1.verifyEmailConfig)().then((r) => {
            if (!r.ok && process.env.OTP_BYPASS?.toLowerCase() !== 'true') {
                console.warn('[email] OTP mail may fail until SMTP is fixed:', r.error);
            }
        });
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server listening on port ${PORT}`);
            console.log(`📍 http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start:', error);
        console.error('Error details:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
};
void start();
