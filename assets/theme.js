/* Apply before CSS paints; the preference is independent of the data views. */
(() => {
  const key = 'agent-atlas-theme';
  const modes = ['system', 'light', 'dark'];
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch { /* Private browsing may disable storage; the control still works. */ }
  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    const color = document.querySelector('meta[name="theme-color"]');
    if (color) color.setAttribute('content', theme === 'dark' ? '#111a16' : '#f5f7f2');
  }
  apply();
  media.addEventListener?.('change', () => { if (preference === 'system') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme-select');
    if (!select) return;
    select.value = preference;
    select.addEventListener('change', () => {
      preference = modes.includes(select.value) ? select.value : 'system';
      try { localStorage.setItem(key, preference); } catch { /* Session-only preference. */ }
      apply();
    });
  });
})();
