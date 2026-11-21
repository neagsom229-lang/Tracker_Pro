import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginSchema, registerSchema } from '../schemas.js';
import pool from '../db.js';
import { badRequest, conflict } from '../util.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

const COOKIE_MAX_AGE = Number(process.env.JWT_COOKIE_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000);

function setSessionCookie(res, id) {
  const token = jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' });
  res.cookie('tracker_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

router.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const email = parsed.data.email.trim().toLowerCase();
  const { rows } = await pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (rows.length > 0) return conflict(res, 'Email already in use');
  const hash = await bcrypt.hash(parsed.data.password, 10);
  const { rows: [u] } = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, hash]
  );
  await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [
    u.id,
    parsed.data.displayName ?? null,
  ]);
  setSessionCookie(res, u.id);
  return res.json({ ok: true, id: u.id, email: u.email });
});

router.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const { rows: [u] } = await pool.query(
    'SELECT id, password_hash FROM users WHERE lower(email) = $1',
    [parsed.data.email.trim().toLowerCase()]
  );
  if (!u) return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  const hashOk = await bcrypt.compare(parsed.data.password, u.password_hash);
  if (!hashOk) return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  setSessionCookie(res, u.id);
  return res.json({ ok: true, id: u.id });
});

router.get('/auth/me', async (req, res) => {
  const user = await optionalAuth(req);
  if (!user) return res.json({ ok: false, user: null });
  return res.json({
    ok: true,
    user: {
      id: String(user.id),
      email: user.email,
      displayName: user.display_name,
      currency: user.currency,
      isAdmin: user.is_admin,
    },
  });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('tracker_session');
  return res.json({ ok: true });
});

export { router as authRouter };
