import { Button } from '@/components/ui/button';
import { useStore } from '@nanostores/react';
import { Moon, Sun } from 'lucide-react';
import { $theme, toggleTheme } from '../store';

const LABELS = {
  switchToLight: 'Switch to light theme',
  switchToDark: 'Switch to dark theme',
} as const;

export function ThemeToggle() {
  const theme = useStore($theme);
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={isDark ? LABELS.switchToLight : LABELS.switchToDark}
      aria-pressed={isDark}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
