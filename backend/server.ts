import './config/bootstrapEnv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { verifyEmailConfig } from './config/email';
import { syncSuperAdminFromEnv } from './services/superAdminSync';
import { dropLegacyEmailIndexes } from './services/dropLegacyEmailIndexes';
import { otpBypassEnabled } from './utils/otpBypass';
import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import adminRoutes from './routes/adminRoutes';
import discoverRoutes from './routes/discoverRoutes';
import walletRoutes from './routes/walletRoutes';
import chatRoutes from './routes/chatRoutes';
import callRoutes from './routes/callRoutes';
import appRoutes from './routes/appRoutes';
import { attachChatSocket } from './socket/chatSocket';
import { reuseOrCreateApiTrace } from './utils/apiTraceLog';
import { getLoadedAppEnv, getLoadedEnvPath } from './config/loadEnv';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      // Razorpay webhook HMAC must use the exact raw body bytes.
      const url = String((req as express.Request).originalUrl || req.url || '');
      if (url.includes('/wallet/razorpay-webhook')) {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    },
  })
);

app.use((req, res, next) => {
  console.log("URL:", req.method, req.url);
  console.log("BODY:", req.body);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    env: getLoadedAppEnv(),
    port: PORT,
    envFile: getLoadedEnvPath(),
  });
});

// Auth routes
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/discover', discoverRoutes);
app.use('/wallet', walletRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);
app.use('/calls', callRoutes);
app.use('/app', appRoutes);

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
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
    });

    await dropLegacyEmailIndexes();
    await syncSuperAdminFromEnv();

    void verifyEmailConfig().then((r) => {
      if (!r.ok && !otpBypassEnabled()) {
        console.warn('[email] OTP mail may fail until SMTP is fixed:', r.error);
      }
    });

    if (process.env.RAZORPAY_KEY_ID?.trim() && !process.env.RAZORPAY_WEBHOOK_SECRET?.trim()) {
      console.warn(
        '[razorpay] RAZORPAY_WEBHOOK_SECRET is not set — /wallet/razorpay-webhook is disabled. UPI payments that miss app verify will not auto-credit until webhook is configured.'
      );
    }

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(
        `[server] listening on 0.0.0.0:${PORT} (env=${getLoadedAppEnv() ?? 'unknown'}, file=${getLoadedEnvPath() ?? 'none'})`
      );
    });
  } catch (error) {
    console.error('❌ Failed to start:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

void start();
