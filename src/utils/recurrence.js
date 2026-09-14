// Small, dependency-free date helpers for the recurring transaction engine.
// Working with ISO date strings ("YYYY-MM-DD") throughout keeps this
// consistent with how dates are stored in Postgres `date` columns.

// Returns the number of days in the given month (`month` is 0-indexed,
// same convention as Date.getMonth()). Passing day 0 of the *next*
// month is the standard JS trick for "last day of this month".
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function addInterval(isoDate, frequency) {
  const d = new Date(`${isoDate}T00:00:00`);
  const originalDay = d.getDate(); // remember the intended day-of-month

  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (frequency === 'monthly') {
    // Jump to day 1 first so `setMonth` can't overflow past a short
    // month (e.g. adding a month to Jan 31 would otherwise land on
    // Mar 3, since Feb has no 31st) — then clamp back to whichever is
    // smaller: the original day, or the last day that target month has.
    // This keeps a rule created on the 31st landing on each month's
    // actual last day (31, 28/29, 31, 30, ...) instead of drifting
    // forward by a few days every time it rolls past a short month.
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(originalDay, daysInMonth(d.getFullYear(), d.getMonth())));
  } else if (frequency === 'yearly') {
    // Same idea, for the one real edge case: a rule created on Feb 29
    // rolling into a non-leap year.
    d.setDate(1);
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(Math.min(originalDay, daysInMonth(d.getFullYear(), d.getMonth())));
  }

  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}