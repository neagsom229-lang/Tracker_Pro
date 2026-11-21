import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/health', async (req, res) => {
  // Prove we're talking to a real Postgres server: run SELECT 1, then
  // return the database name and server version.
  await pool.query('SELECT 1 AS ok');
  const { rows } = await pool.query('SELECT current_database() AS database, version() AS "serverVersion"');
  res.json({ ok: true, database: rows[0].database, serverVersion: rows[0].serverVersion });
});

export { router as healthRouter };
