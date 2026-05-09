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
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  console.log('Loading .env from:', envPath);
  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    console.error('Error loading .env:', result.error);
  } else {
    console.log('✅ .env loaded successfully');
  }
} else {
  // In production, env vars are often injected by PM2/systemd/container runtime.
  console.warn('⚠️ No .env file found. Continuing with existing process environment variables.');
}

console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ SET' : '❌ NOT SET');
console.log(
  'HF_API_TOKEN:',
  process.env.HF_API_TOKEN && process.env.HF_API_TOKEN.trim()
    ? `✅ SET (len=${process.env.HF_API_TOKEN.trim().length})`
    : '❌ NOT SET'
);
console.log(
  'HF_VOICE_GENDER_MODEL_ID:',
  process.env.HF_VOICE_GENDER_MODEL_ID || 'audeering/wav2vec2-large-robust-24-ft-age-gender (default)'
);
console.log(
  'VOICE_GENDER_FEMALE_MIN_CONFIDENCE:',
  process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE || '0.70 (default)'
);

// Normal imports
import './config/bootstrapEnv';
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
import { reuseOrCreateApiTrace } from './utils/apiTraceLog';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

app.use(express.json());

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
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/discover', discoverRoutes);
app.use('/wallet', walletRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);
app.use('/calls', callRoutes);

const httpServer = http.createServer(app);
void attachChatSocket(httpServer);

// 404
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const traceId = reuseOrCreateApiTrace(res);
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    '[api:unhandled_route_error]',
    JSON.stringify({
      traceId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      errMessage: msg,
      stack: err instanceof Error ? err.stack : undefined,
    })
  );
  res.status(500).json({
    traceId,
    message: msg || 'Internal server error',
    error: 'UNHANDLED_ROUTE_ERROR',
  });
});

const start = async (): Promise<void> => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }
    
    console.log('Attempting to connect to MongoDB...');
    console.log('Using SRV resolution (let Node.js resolve normally)');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
    });
    
    console.log('✅ MongoDB connected successfully');
    
    await syncSuperAdminFromEnv();

    void verifyEmailConfig().then((r) => {
      if (!r.ok && process.env.OTP_BYPASS?.toLowerCase() !== 'true') {
        console.warn('[email] OTP mail may fail until SMTP is fixed:', r.error);
      }
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server listening on port ${PORT}`);
      console.log(`📍 http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

void start();