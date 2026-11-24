import { Router } from 'express';
import { profileUpdateSchema, proToggleSchema } from '../schemas.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import pool from '../db.js';
import { badRequest, notFound, ok } from '../util.js';

const router = Router();

// dataProvider.getProfile reads { id, email, displayName, currency, isAdmin }.
// No session yet → 200 with ok:false (the browser logs a console error for
// every non-2xx response; pre-login 401s pollute the dev console).
router.get('/profile', async (req, res) => {
  const user = await optionalAuth(req);
  if (!user) return res.json({ ok: false, user: null });
  return res.json({
    ok: true,
    id: String(user.id),
    email: user.email,
    displayName: user.display_name,
    currency: user.currency,
    isAdmin: user.is_admin,
    isPro: user.is_pro,
  });
});

router.put('/profile', requireAuth, async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const patch = {};
  for (const key of ['display_name', 'currency']) {
    if (parsed.data[key] !== undefined) patch[key] = parsed.data[key];
  }
  if (Object.keys(patch).length === 0) {
    return badRequest(res, [{ field: '', message: 'Nothing to update (whitelist: display_name, currency)' }]);
  }
  const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
  const values = [req.user.id, ...Object.values(patch)];
  const { rows } = await pool.query(
    `UPDATE profiles SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
    values
  );
  if (rows.length === 0) return notFound(res);
  return ok(res);
});

// Dev toggle for Pro status in local mode. Mounted only when NODE_ENV=development
// AND ENABLE_DEV_PRO_TOGGLE=true — otherwise the route does not exist (404).
const devProToggleEnabled = process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_PRO_TOGGLE === 'true';
if (devProToggleEnabled) {
  router.put('/profile/is_pro', requireAuth, async (req, res) => {
    const parsed = proToggleSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);
    const { rows } = await pool.query('UPDATE users SET is_pro = $2 WHERE id = $1 RETURNING id', [
      req.user.id,
      parsed.data.enabled,
    ]);
    if (rows.length === 0) return notFound(res);
    return ok(res);
  });
}

export { router as profileRouter };
