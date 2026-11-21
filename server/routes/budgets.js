import { Router } from 'express';
import { budgetUpsertSchema } from '../schemas.js';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db.js';
import { badRequest, notFound, ok } from '../util.js';

const router = Router();

router.get('/budgets', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT category, monthly_limit FROM budgets WHERE user_id = $1', [req.user.id]);
  // dataProvider.getBudgets returns { [category]: limit } — same shape.
  res.json(Object.fromEntries(rows.map((b) => [b.category, Number(b.monthly_limit)])));
});

router.post('/budgets', requireAuth, async (req, res) => {
  const parsed = budgetUpsertSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  await pool.query(
    'INSERT INTO budgets (user_id, category, monthly_limit) VALUES ($1, $2, $3) ON CONFLICT (user_id, category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit',
    [req.user.id, parsed.data.category, parsed.data.monthly_limit]
  );
  return ok(res);
});

router.delete('/budgets/:category', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM budgets WHERE user_id = $1 AND category = $2 RETURNING id',
    [req.user.id, decodeURIComponent(req.params.category)]
  );
  if (rows.length === 0) return notFound(res);
  return ok(res);
});

export { router as budgetsRouter };
