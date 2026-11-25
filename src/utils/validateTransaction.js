const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function validateTransactionPayload(p) {
  if (!p || typeof p !== 'object') return 'Missing transaction details.';
  if (typeof p.description !== 'string' || !p.description.trim()) return 'Add a short description.';
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount === 0) return 'Enter an amount other than zero.';
  if (typeof p.date !== 'string' || !ISO_DATE.test(p.date)) return 'Pick a valid date.';
  if (typeof p.category !== 'string' || !p.category) return 'Pick a category.';
  return null;
}
