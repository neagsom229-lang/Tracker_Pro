// Small, dependency-free date helpers for the recurring transaction engine.
// Working with ISO date strings ("YYYY-MM-DD") throughout keeps this
// consistent with how dates are stored in Postgres `date` columns.

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function addInterval(isoDate, frequency) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const originalDay = d.getDate(); // remember the intended day-of-month

  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (frequency === 'monthly') {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(originalDay, daysInMonth(d.getFullYear(), d.getMonth())));
  } else if (frequency === 'yearly') {
    d.setDate(1);
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(Math.min(originalDay, daysInMonth(d.getFullYear(), d.getMonth())));
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
