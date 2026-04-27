// ===== COMPLETE DNS FIX FOR WINDOWS =====
import dns from 'dns';

// Override DNS lookup to force IPv4 - with proper typing
const originalLookup = dns.lookup;
(dns as any).lookup = function(hostname: string, options: any, callback?: any) {
    if (typeof options === 'function') {
        callback = options;
        options = { family: 4 };
    } else if (typeof options === 'number') {
        options = { family: options };
    } else {
        options = options || {};
        options.family = 4;
    }
    return originalLookup(hostname, options, callback as any);
};

// Override SRV resolution - THIS IS THE KEY FIX
const originalResolveSrv = dns.resolveSrv;
(dns as any).resolveSrv = function(hostname: string, callback: any) {
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
if (dns.promises) {
    const originalPromisesResolveSrv = (dns.promises as any).resolveSrv;
    (dns.promises as any).resolveSrv = async function(hostname: string) {
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
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('✅ .env loaded');
}

console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET ✓' : 'NOT SET ✗');

// Normal imports
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { verifyEmailConfig } from './config/email';
import { syncSuperAdminFromEnv } from './services/superAdminSync';
import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import adminRoutes from './routes/adminRoutes';
import discoverRoutes from './routes/discoverRoutes';
import walletRoutes from './routes/walletRoutes';
import chatRoutes from './routes/chatRoutes';
import callRoutes from './routes/callRoutes';
import { attachChatSocket } from './socket/chatSocket';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.use(cors({ origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
    console.log("URL:", req.method, req.url);
    next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/discover', discoverRoutes);
app.use('/wallet', walletRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);
app.use('/calls', callRoutes);

const httpServer = http.createServer(app);
void attachChatSocket(httpServer);

app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal error' });
});

const start = async () => {
    try {
        if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
        
        console.log('\n📡 Connecting to MongoDB...');
        
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 60000,
        });
        
        console.log('✅ MongoDB connected successfully!');
        
        await syncSuperAdminFromEnv();
        void verifyEmailConfig();

        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`\n✅ Server running on http://localhost:${PORT}\n`);
        });
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

start();