"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/bootstrapEnv");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_1 = __importDefault(require("./config/database"));
const email_1 = require("./config/email");
const superAdminSync_1 = require("./services/superAdminSync");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const discoverRoutes_1 = __importDefault(require("./routes/discoverRoutes"));
const walletRoutes_1 = __importDefault(require("./routes/walletRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const chatSocket_1 = require("./socket/chatSocket");
const app = (0, express_1.default)();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
// app.use(cors());
// app.use(cors({
//   origin: [
//     'http://localhost:3000',
//     'http://localhost:5173', // vite dev
//     'https://dating-admin-mocha.vercel.app',
//     'https://dating-app-drab-omega.vercel.app',
//     'https://backend.nesthamapp.com',
//     'https://nesthamapp.com'
//   ],
//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
//   credentials: true
// }));
app.use((0, cors_1.default)({
    origin: true, // reflect any origin
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
// Auth routes mounted at /auth
app.use('/auth', authRoutes_1.default);
app.use('/profile', profileRoutes_1.default);
app.use('/discover', discoverRoutes_1.default);
app.use('/wallet', walletRoutes_1.default);
app.use('/admin', adminRoutes_1.default);
app.use('/chat', chatRoutes_1.default);
const httpServer = http_1.default.createServer(app);
void (0, chatSocket_1.attachChatSocket)(httpServer);
// 404
app.use((_req, res) => {
    res.status(404).json({ message: 'Not found' });
});
// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
    const msg = err instanceof Error ? err.message : String(err);
    // Avoid leaking secrets; send a generic message but log details
    console.error(err);
    res.status(500).json({ message: msg || 'Internal server error' });
});
const start = async () => {
    await (0, database_1.default)();
    await (0, superAdminSync_1.syncSuperAdminFromEnv)();
    void (0, email_1.verifyEmailConfig)().then((r) => {
        if (!r.ok && process.env.OTP_BYPASS?.toLowerCase() !== 'true') {
            console.warn('[email] OTP mail may fail until SMTP is fixed:', r.error);
        }
    });
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Server listening on port ${PORT} (reachable at http://localhost:${PORT} and your LAN IP)`);
    });
};
void start();
