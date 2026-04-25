import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface UiState {
  sidebarCollapsed: boolean;
  /**
   * 'system' defers to prefers-color-scheme media query.
   * 'dark' / 'light' are explicit overrides persisted in localStorage.
   * The CSS handles the actual rendering: :root defaults dark,
   * :root.light applies the light palette, :root:not(.dark):not(.light)
   * defers to the OS via the prefers-color-scheme @media block.
   */
  theme: Theme;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'system',
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'mastercontrol-ui',
      // Only persist the user-facing prefs; derived runtime state stays ephemeral.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    },
  ),
);
