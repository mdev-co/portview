import { atom } from 'nanostores';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sps:theme';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const persisted = window.localStorage.getItem(STORAGE_KEY);
  if (persisted === 'light' || persisted === 'dark') return persisted;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export const $theme = atom<Theme>(readInitialTheme());

applyTheme($theme.get());

$theme.listen(value => {
  applyTheme(value);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, value);
  }
});

export function toggleTheme(): void {
  $theme.set($theme.get() === 'dark' ? 'light' : 'dark');
}
