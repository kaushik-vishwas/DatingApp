"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ===== COMPLETE DNS FIX FOR WINDOWS =====
const dns_1 = __importDefault(require("dns"));
// Override DNS lookup to force IPv4 - with proper typing
const originalLookup = dns_1.default.lookup;
dns_1.default.lookup = function (hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = { family: 4 };
    }
    else if (typeof options === 'number') {
        options = { family: options };
    }
    else {
        options = options || {};
        options.family = 4;
    }
    return originalLookup(hostname, options, callback);
};
// Override SRV resolution - THIS IS THE KEY FIX
const originalResolveSrv = dns_1.default.resolveSrv;
dns_1.default.resolveSrv = function (hostname, callback) {
    console.log('📍 SRV lookup intercepted:', hostname);
    if (hostname === '_mongodb._tcp.cluster0.aswdhov.mongodb.net') {
        console.log('✅ Returning direct shard addresses for MongoDB');
        const addresses = [
            { name: 'cluster0-shard-00-00.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
            { name: 'cluster0-shard-00-01.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
            { name: 'cluster0-shard-00-02.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 }
        ];
        return callback(null, addresses);
    }
    return originalResolveSrv(hostname, callback);
};
// Override promises API - THIS IS CRITICAL
if (dns_1.default.promises) {
    const originalPromisesResolveSrv = dns_1.default.promises.resolveSrv;
    dns_1.default.promises.resolveSrv = async function (hostname) {
        console.log('📍 Promises SRV intercepted:', hostname);
        if (hostname === '_mongodb._tcp.cluster0.aswdhov.mongodb.net') {
            console.log('✅ Returning direct shard addresses (promises)');
            return [
                { name: 'cluster0-shard-00-00.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
                { name: 'cluster0-shard-00-01.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
                { name: 'cluster0-shard-00-02.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 }
            ];
        }
        return originalPromisesResolveSrv(hostname);
    };
}
console.log('✅ DNS overrides installed');
// ===== END DNS FIX =====
// LOAD ENV
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const envPath = path_1.default.resolve(process.cwd(), '.env');
if (fs_1.default.existsSync(envPath)) {
    dotenv_1.default.config({ path: envPath });
    console.log('✅ .env loaded');
}
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET ✓' : 'NOT SET ✗');
// Normal imports
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
app.use((0, cors_1.default)({ origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: true }));
app.use(express_1.default.json());
app.use((req, res, next) => {
    console.log("URL:", req.method, req.url);
    next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes_1.default);
app.use('/profile', profileRoutes_1.default);
app.use('/discover', discoverRoutes_1.default);
app.use('/wallet', walletRoutes_1.default);
app.use('/admin', adminRoutes_1.default);
app.use('/chat', chatRoutes_1.default);
app.use('/calls', callRoutes_1.default);
const httpServer = http_1.default.createServer(app);
void (0, chatSocket_1.attachChatSocket)(httpServer);
app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal error' });
});
const start = async () => {
    try {
        if (!process.env.MONGODB_URI)
            throw new Error('MONGODB_URI not set');
        console.log('\n📡 Connecting to MongoDB...');
        await mongoose_1.default.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 60000,
        });
        console.log('✅ MongoDB connected successfully!');
        await (0, superAdminSync_1.syncSuperAdminFromEnv)();
        void (0, email_1.verifyEmailConfig)();
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`\n✅ Server running on http://localhost:${PORT}\n`);
        });
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};
start();
