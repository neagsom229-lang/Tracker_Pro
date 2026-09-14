// Small, dependency-free date helpers for the recurring transaction engine.
// Working with ISO date strings ("YYYY-MM-DD") throughout keeps this
// consistent with how dates are stored in Postgres `date` columns.

export function addInterval(isoDate, frequency) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
