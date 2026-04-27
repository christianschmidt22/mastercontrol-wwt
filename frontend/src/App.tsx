import { useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { CommandPalette } from './components/overlays/CommandPalette';
import { HomePage } from './pages/HomePage';
import { TasksPage } from './pages/TasksPage';
import { ReportsPage } from './pages/ReportsPage';
import { CustomerPage } from './pages/CustomerPage';
import { OemPage } from './pages/OemPage';
import { AgentsPage } from './pages/AgentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFound } from './pages/NotFound';
import { useUiStore } from './store/useUiStore';

export function App() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore();

  // Track the element focused before the palette opens so we can restore it.
  const priorFocusRef = useRef<Element | null>(null);

  // Global Ctrl+K / Cmd+K listener.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'k') return;
      // Ignore when typing in a text field — let the OS / browser handle it.
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      priorFocusRef.current = document.activeElement;
      setCommandPaletteOpen(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCommandPaletteOpen]);

  function handleClose() {
    setCommandPaletteOpen(false);
    // Restore focus to whatever was focused before the palette opened.
    if (priorFocusRef.current instanceof HTMLElement) {
      priorFocusRef.current.focus();
    }
    priorFocusRef.current = null;
  }

  return (
    <>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/customers/:id" element={<CustomerPage />} />
          <Route path="/oem" element={<OemPage />} />
          <Route path="/oem/:id" element={<OemPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>

      {/* Command palette mounted once at root; visibility gated on isOpen prop */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={handleClose} />
    </>
  );
}
