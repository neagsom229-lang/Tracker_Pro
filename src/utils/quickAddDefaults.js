// Remembers the user's last Quick Add / transaction entry choices
// (last category, direction) so the next entry starts where they left
// off — fewer taps to log an expense. "Currency" defaults to the stored
// profile currency; there is no account field, so there is nothing to
// remember there.
const KEY = 'obsidian:last-quick-add';

export function getLastQuickAddDefaults() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function setLastQuickAddDefaults(partial) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getLastQuickAddDefaults(), ...partial }));
  } catch {
    // Ignore: some private-mode sessions disallow writes.
  }
}
