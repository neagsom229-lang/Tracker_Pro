// Shared helpers for the Express API. All SQL uses parameterized queries
// ($1, $2, …); values here are deliberately plain JSON-serializable shapes
// so the frontend can consume them as-is.

// pg parses DATE via postgres-date (a Date object). The app expects the
// 'YYYY-MM-DD' string shape (Supabase returns date columns as strings), so
// db.js sets an identity parser; this helper also copes if it ever returns
// something else.
export function toDateStr(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) {
    const y = String(v.getFullYear()).padStart(4, '0');
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return v;
}

// Timestamps — same idea, emit ISO strings like Supabase does.
export function toISO(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
}

export function ok(res, data = { ok: true }) {
  return res.json(data);
}

export function badRequest(res, issues) {
  const details = (issues || []).map((i) => ({
    field: i?.path ? i.path.join('.') : String(i?.field ?? ''),
    message: i?.message ?? 'Invalid value',
  }));
  return res.status(400).json({ ok: false, error: 'Invalid request', details });
}

export function notFound(res) {
  return res.status(404).json({ ok: false, error: 'Not found' });
}

export function conflict(res, message = 'Conflict') {
  return res.status(409).json({ ok: false, error: message });
}
