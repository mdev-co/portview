import { Button } from '@/components/ui/button';
import { useStore } from '@nanostores/react';
import { Moon, Sun } from 'lucide-react';
import { $theme, toggleTheme } from '../store';

export function ThemeToggle() {
  const theme = useStore($theme);
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
