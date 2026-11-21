// Auth middleware — verifies the httpOnly session cookie set by
// /api/auth/login and /api/auth/register. Reads the user + profile by
// id from `users`/`profiles` (user_id scoping is enforced at the SQL
// level for every write route; reads here are single-row lookups by PK).
import jwt from 'jsonwebtoken';
import pool from '../db.js';

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// Shared user lookup. Returns the user row for a valid session token,
// or null otherwise (including missing/expired tokens).
async function parseUser(token) {
  if (!token) return null;
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (!payload?.sub) return null;
  const { rows } = await pool.query(
    'SELECT u.id, u.email, u.is_admin, u.is_pro, p.display_name, p.currency FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = $1',
    [payload.sub]
  );
  return rows[0] ?? null;
}

// GET /api/auth/me uses this: it answers 200 with ok:false when there is
// no session yet, because the browser logs a console error for any
// non-2xx response and pre-login 401s pollute the dev console.
export async function optionalAuth(req) {
  try {
    return await parseUser(parseCookies(req.headers?.cookie)?.tracker_session);
  } catch (err) {
    console.error('[server] optionalAuth error:', err.message);
    return null;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req.headers?.cookie);
    const token = cookies.tracker_session;
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    const user = await parseUser(token);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }
    console.error('[server] requireAuth error:', err.message);
    return res.status(500).json({ ok: false, error: 'Auth check failed' });
  }
}
