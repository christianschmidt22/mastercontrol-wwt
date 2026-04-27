/**
 * renderWithProviders
 *
 * Thin wrapper that mounts any component inside:
 *   - QueryClientProvider (fresh per-test client, retries disabled)
 *   - MemoryRouter (React Router v6)
 *
 * Keep this wrapper minimal — tests should exercise real providers,
 * not mocked-out shells (per Vercel Web Interface Guidelines).
 */

import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: MemoryRouterProps;
}

export function renderWithProviders(
  ui: React.ReactElement,
  { routerProps, ...renderOptions }: RenderWithProvidersOptions = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
