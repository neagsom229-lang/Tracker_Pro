import { Router } from 'express';
import { recurringCreateSchema, recurringUpdateSchema } from '../schemas.js';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db.js';
import { badRequest, notFound, ok, toDateStr } from '../util.js';

const router = Router();

// dataProvider.getRecurring maps next_run_date → nextRunDate — same shape.
const mapRow = (r) =>
  r
    ? {
        id: String(r.id),
        description: r.description,
        amount: r.amount,
        category: r.category,
        frequency: r.frequency,
        nextRunDate: toDateStr(r.next_run_date),
      }
    : null;

router.get('/recurring', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, description, amount, category, frequency, next_run_date FROM recurring_rules WHERE user_id = $1 ORDER BY created_at',
    [req.user.id]
  );
  res.json(rows.map(mapRow));
});

router.post('/recurring', requireAuth, async (req, res) => {
  const parsed = recurringCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const { rows: [row] } = await pool.query(
    'INSERT INTO recurring_rules (user_id, description, amount, category, frequency, next_run_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, description, amount, category, frequency, next_run_date',
    [req.user.id, parsed.data.description, parsed.data.amount, parsed.data.category, parsed.data.frequency, parsed.data.nextRunDate]
  );
  res.json(mapRow(row));
});

router.put('/recurring/:id', requireAuth, async (req, res) => {
  const parsed = recurringUpdateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues);
  const { rows } = await pool.query(
    'UPDATE recurring_rules SET next_run_date = $2 WHERE id = $1 AND user_id = $3 RETURNING id, next_run_date',
    [req.params.id, parsed.data.nextRunDate, req.user.id]
  );
  if (rows.length === 0) return notFound(res);
  res.json(mapRow({ id: rows[0].id, next_run_date: rows[0].next_run_date }));
});

router.delete('/recurring/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM recurring_rules WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (rows.length === 0) return notFound(res);
  return ok(res);
});

export { router as recurringRouter };
