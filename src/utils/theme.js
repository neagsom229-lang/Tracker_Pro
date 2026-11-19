// Theme persistence + first-visit detection (prefers-color-scheme).
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  if (typeof localStorage !== 'undefined') localStorage.setItem('theme', theme);
}

export function initTheme() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
  const prefersLight =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = stored || (prefersLight ? 'light' : 'dark');
  applyTheme(theme);
  return theme;
}
