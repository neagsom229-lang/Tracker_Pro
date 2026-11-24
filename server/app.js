// app.js — the Express app. server/index.js adds the port, JWT-secret
// check and warm-up; tests import app.js directly.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { transactionsRouter } from './routes/transactions.js';
import { budgetsRouter } from './routes/budgets.js';
import { recurringRouter } from './routes/recurring.js';
import { profileRouter } from './routes/profile.js';
import { emptyRouter } from './routes/empty.js';
import _pool from './db.js';

// Rate limiting:
//  - Strict on POST /api/auth/login and POST /api/auth/register: 15 per
//    15 min. Successful logins/registers don't count against the window
//    (skipSuccessfulRequests — a 401 still does).
//  - A generous general limit (300 per 15 min) applies everywhere else —
//    including GET /api/auth/me — so a busy client can't exhaust the
//    strict limiter by other means.
const limiterOpts = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' },
};
const loginLimiter = rateLimit({ ...limiterOpts, max: 15, skipSuccessfulRequests: true });
const registerLimiter = rateLimit({ ...limiterOpts, max: 15, skipSuccessfulRequests: true });
const generalLimiter = rateLimit({
  ...limiterOpts,
  max: 300,
  skip: (req) => req.path === '/api/auth/login' || req.path === '/api/auth/register',
});

const app = express();

// Behind a reverse proxy (production), X-Forwarded-For should drive
// rate-limiter IPs. Dev stays untrusted (no proxy there).
app.set('trust proxy', process.env.NODE_ENV === 'production');

// Helmet + CORS for the Vite origin only. The browser calls these endpoints
// through the Vite dev server proxy (/api -> http://localhost:4000), so same-origin.
app.use(helmet());
app.use(cors({ origin: process.env.APP_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRouter);
app.post('/api/auth/login', loginLimiter);
app.post('/api/auth/register', registerLimiter);
app.use('/api', generalLimiter, authRouter, transactionsRouter, budgetsRouter, recurringRouter, profileRouter, emptyRouter);

app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// Malformed JSON body (body-parser) → 400 JSON.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && req.body === undefined) {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }
  next(err);
});

// Final error handler — JSON only, details logged server-side.
app.use((err, req, res) => {
  console.error('[server] error:', err?.message);
  if (!res.headersSent) return res.status(500).json({ ok: false, error: 'Server error' });
  res.end();
});

export { app };
