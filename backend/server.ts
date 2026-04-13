import './config/bootstrapEnv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import connectDB from './config/database';
import { verifyEmailConfig } from './config/email';
import { syncSuperAdminFromEnv } from './services/superAdminSync';
import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import adminRoutes from './routes/adminRoutes';
import discoverRoutes from './routes/discoverRoutes';
import walletRoutes from './routes/walletRoutes';
import chatRoutes from './routes/chatRoutes';
import { attachChatSocket } from './socket/chatSocket';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Auth routes mounted at /auth
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/discover', discoverRoutes);
app.use('/wallet', walletRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);

const httpServer = http.createServer(app);
void attachChatSocket(httpServer);

// 404
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  // Avoid leaking secrets; send a generic message but log details
  console.error(err);
  res.status(500).json({ message: msg || 'Internal server error' });
});

const start = async (): Promise<void> => {
  await connectDB();
  await syncSuperAdminFromEnv();

  void verifyEmailConfig().then((r) => {
    if (!r.ok && process.env.OTP_BYPASS?.toLowerCase() !== 'true') {
      console.warn('[email] OTP mail may fail until SMTP is fixed:', r.error);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (reachable at http://localhost:${PORT} and your LAN IP)`);
  });
};

void start();

