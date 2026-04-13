/**
 * Express entry point — dating app auth API.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// app.use(cors());
app.use(cors({
  origin: [
    'http://localhost:3000', // local admin panel
    'https://dating-app-admin-six.vercel.app/', // ✅ YOUR LIVE ADMIN PANEL
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Auth routes mounted at /auth
app.use('/auth', authRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const start = async () => {
  await connectDB();

  if (!process.env.JWT_SECRET) {
    console.warn('Warning: JWT_SECRET is not set. Set it in .env for production.');
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
