import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { App } from './App';
import { isTheme, useUiStore, type Theme } from './store/useUiStore';
import { applyThemeToDocument } from './pages/SettingsPage';
import './index.css';

// Sync the persisted theme to the document <html> class on boot. Without this,
// a hard reload would render with no theme class until the user re-toggled.
applyThemeToDocument(useUiStore.getState().theme);

async function fetchSavedTheme(): Promise<Theme | null> {
  try {
    const response = await fetch('/api/settings/theme');
    if (!response.ok) return null;
    const body = (await response.json()) as { value?: unknown };
    return isTheme(body.value) ? body.value : null;
  } catch {
    return null;
  }
}

async function saveThemePreference(theme: Theme): Promise<void> {
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'theme', value: theme }),
    });
  } catch {
    // Theme still persists in local UI storage when the backend is unavailable.
  }
}

void fetchSavedTheme().then((savedTheme) => {
  if (!savedTheme) {
    const localTheme = useUiStore.getState().theme;
    if (localTheme !== 'system') void saveThemePreference(localTheme);
    return;
  }
  useUiStore.getState().setTheme(savedTheme);
  applyThemeToDocument(savedTheme);
});

let previousTheme = useUiStore.getState().theme;
useUiStore.subscribe((state) => {
  if (state.theme === previousTheme) return;
  previousTheme = state.theme;
  applyThemeToDocument(state.theme);
  void saveThemePreference(state.theme);
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
