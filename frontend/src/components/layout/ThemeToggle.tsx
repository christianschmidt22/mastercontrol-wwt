import { useEffect, type ReactNode } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useUiStore, type Theme } from '../../store/useUiStore';

const CYCLE: Theme[] = ['system', 'dark', 'light'];

const labels: Record<Theme, string> = {
  system: 'System theme',
  dark: 'Dark theme',
  light: 'Light theme',
};

const icons: Record<Theme, ReactNode> = {
  system: <Monitor size={16} strokeWidth={1.5} aria-hidden="true" />,
  dark: <Moon size={16} strokeWidth={1.5} aria-hidden="true" />,
  light: <Sun size={16} strokeWidth={1.5} aria-hidden="true" />,
};

/**
 * Cycles light → dark → system. Syncs the `.dark` / `.light` class on
 * <html> so CSS variables pick up the right palette.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useUiStore();

  // Sync <html> class whenever theme changes.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'light') root.classList.add('light');
    // 'system' — no class; CSS @media block takes over.
  }, [theme]);

  function handleClick() {
    const idx = CYCLE.indexOf(theme);
    const next = CYCLE[(idx + 1) % CYCLE.length] ?? 'system';
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={labels[theme]}
      style={{
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: 'transparent',
        borderRadius: 4,
        color: 'var(--ink-3)',
        cursor: 'pointer',
      }}
    >
      {icons[theme]}
    </button>
  );
}
