/**
 * OemDocsTile.test.tsx
 *
 * Tests for OEM document scan rendering.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OemDocsTile } from './OemDocsTile';
import { request } from '../../../api/http';

vi.mock('../../../api/http', () => ({
  request: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('OemDocsTile', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
  });

  it('calls the OEM document scan endpoint and renders files', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      configured: true,
      root: 'C:\\docs',
      files: [
        {
          name: 'Implementation Guide.pdf',
          path: 'C:\\docs\\Implementation Guide.pdf',
          kind: 'file',
          size: 2048,
          mtime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    renderWithClient(<OemDocsTile orgId={42} />);

    expect(await screen.findByText('Implementation Guide.pdf')).toBeInTheDocument();
    const eventSpy = vi.spyOn(window, 'dispatchEvent');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Read document Implementation Guide.pdf with agent',
      }),
    );
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mastercontrol:read-document',
      }),
    );
    eventSpy.mockRestore();
    expect(request).toHaveBeenCalledWith('GET', '/api/oem/42/documents/scan');
  });

  it('renders an unconfigured empty state', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      configured: false,
      files: [],
    });

    renderWithClient(<OemDocsTile orgId={42} />);

    expect(await screen.findByText('No OEM folder configured yet.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an empty folder state', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      configured: true,
      root: 'C:\\docs',
      files: [],
    });

    renderWithClient(<OemDocsTile orgId={42} />);

    expect(await screen.findByText('No files found in the OEM document folder.')).toBeInTheDocument();
  });

  it('renders a scan failure state', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('boom'));

    renderWithClient(<OemDocsTile orgId={42} />);

    expect(
      await screen.findByText('Document scan failed. Check the OEM folder setting.'),
    ).toBeInTheDocument();
  });
});
