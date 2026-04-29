import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { App } from './App';
import { useUiStore } from './store/useUiStore';
import { applyThemeToDocument } from './pages/SettingsPage';
import './index.css';

// Sync the persisted theme to the document <html> class on boot. Without this,
// a hard reload would render with no theme class until the user re-toggled.
applyThemeToDocument(useUiStore.getState().theme);

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
