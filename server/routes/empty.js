import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Until phase 2 moves these to real tables/queries, the local backend
// returns empty collections — the dashboard loads without erroring.
router.get('/notifications', requireAuth, (req, res) => res.json([]));
router.get('/goals', requireAuth, (req, res) => res.json([]));
router.get('/debts', requireAuth, (req, res) => res.json([]));
router.get('/assets', requireAuth, (req, res) => res.json([]));
router.get('/net_worth_history', requireAuth, (req, res) => res.json([]));
router.get('/parse_corrections', requireAuth, (req, res) => res.json({}));

// Phase 2: these become real tables/queries. For now they are no-ops so
// the frontend can call them uniformly in local mode.
router.post('/notifications/read/:id', requireAuth, (req, res) => res.json({ ok: true }));
router.post('/notifications/read-all', requireAuth, (req, res) => res.json({ ok: true }));
router.post('/parse_corrections', requireAuth, (req, res) => res.json({ ok: true }));

export { router as emptyRouter };
