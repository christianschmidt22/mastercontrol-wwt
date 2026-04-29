import { useEffect, type ReactNode } from 'react';
import { Moon, Sun, Monitor, Palette } from 'lucide-react';
import { useUiStore, type Theme } from '../../store/useUiStore';
import { applyThemeToDocument } from '../../pages/SettingsPage';

const CYCLE: Theme[] = ['system', 'dark', 'light'];

const labels: Partial<Record<Theme, string>> = {
  system: 'System theme',
  dark: 'Dark theme',
  light: 'Light theme',
};

const icons: Partial<Record<Theme, ReactNode>> = {
  system: <Monitor size={16} strokeWidth={1.5} aria-hidden="true" />,
  dark: <Moon size={16} strokeWidth={1.5} aria-hidden="true" />,
  light: <Sun size={16} strokeWidth={1.5} aria-hidden="true" />,
};

/**
 * Cycles light → dark → system. Syncs the theme class on <html> so CSS
 * variables pick up the right palette. If the active theme is one of the
 * named variants (pine, moss, carbon, oxblood, ridge) the toggle keeps
 * showing it and falls back to system on next click.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useUiStore();

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  function handleClick() {
    const idx = CYCLE.indexOf(theme);
    // If the user is on a named theme (pine, moss, …) idx is -1 → start at system.
    const next = idx === -1 ? 'system' : CYCLE[(idx + 1) % CYCLE.length] ?? 'system';
    setTheme(next);
  }

  const label = labels[theme] ?? `${theme[0]?.toUpperCase()}${theme.slice(1)} theme`;
  const icon = icons[theme] ?? <Palette size={16} strokeWidth={1.5} aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
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
      {icon}
    </button>
  );
}
