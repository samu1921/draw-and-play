// Applies the chosen colour scheme before the first paint, so a dark choice does not flash light.
// Kept in sync with src/lib/theme.ts (same storage key). A separate file because the CSP allows no inline scripts.
try {
  var theme = localStorage.getItem('draw-and-play.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (e) {
  // No storage: the system setting applies
}
