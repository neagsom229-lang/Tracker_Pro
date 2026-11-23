import { Router } from 'express';
import { createTransactionSchema, updateTransactionSchema, uuidSchema } from '../schemas.js';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db.js';
import { badRequest, notFound, ok, toDateStr, toISO } from '../util.js';

const router = Router();

const mapRow = (r) =>
  r
    ? {
        id: String(r.id),
        description: r.description,
        amount: r.amount,
        category: r.category,
        date: toDateStr(r.date),
        createdAt: toISO(r.created_at),
      }
    : null;

router.get('/transactions', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, description, amount, category, date, created_at FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC',
    [req.user.id]
  );
  res.json(rows.map(mapRow));
});

router.get('/transactions/:id', requireAuth, async (req, res) => {
  if (!uuidSchema.safeParse(req.params.id).success) return notFound(res);
  const { rows } = await pool.query(
    'SELECT id, description, amount, category, date, created_at FROM transactions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (rows.length === 0) return notFound(res);
  res.json(mapRow(rows[0]));
});

router.post('/transactions', requireAuth, async (req, res) => {
  const parsed = createTransactionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const { description, amount, category, date } = parsed.data;
  const { rows: [row] } = await pool.query(
    'INSERT INTO transactions (user_id, description, amount, category, date) VALUES ($1, $2, $3, $4, $5) RETURNING id, description, amount, category, date, created_at',
    [req.user.id, description, amount, category, date]
  );
  res.json(mapRow(row));
});

router.put('/transactions/:id', requireAuth, async (req, res) => {
  if (!uuidSchema.safeParse(req.params.id).success) return notFound(res);
  const parsed = updateTransactionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const patch = {};
  for (const k of ['description', 'amount', 'category', 'date']) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }
  if (Object.keys(patch).length === 0) {
    return badRequest(res, [{ field: '', message: 'Nothing to update' }]);
  }
  const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 3}`);
  const values = [req.params.id, req.user.id, ...Object.values(patch)];
  const { rows } = await pool.query(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING id, description, amount, category, date, created_at`,
    values
  );
  if (rows.length === 0) return notFound(res);
  res.json(mapRow(rows[0]));
});

router.delete('/transactions/:id', requireAuth, async (req, res) => {
  if (!uuidSchema.safeParse(req.params.id).success) return notFound(res);
  const { rows } = await pool.query(
    'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (rows.length === 0) return notFound(res);
  return ok(res);
});

export { router as transactionsRouter };
