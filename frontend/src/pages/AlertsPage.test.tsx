import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertsPage } from './AlertsPage';
import type { SystemAlert } from '../types';

const markRead = vi.fn();
const resolveAlert = vi.fn();
const unresolveAlert = vi.fn();

vi.mock('../api/useCalendar', () => ({
  useAlerts: vi.fn(),
  useMarkAlertRead: vi.fn(() => ({ mutate: markRead })),
  useResolveAlert: vi.fn(() => ({ mutate: resolveAlert })),
  useUnresolveAlert: vi.fn(() => ({ mutate: unresolveAlert })),
}));

import { useAlerts } from '../api/useCalendar';

const activeAlert: SystemAlert = {
  id: 1,
  severity: 'warn',
  source: 'noteExtraction',
  message: 'Note extraction failed',
  detail: '{"note_id":37}',
  read_at: null,
  resolved_at: null,
  created_at: '2026-04-29 00:08:29',
};

const resolvedAlert: SystemAlert = {
  ...activeAlert,
  id: 2,
  severity: 'error',
  source: 'calendarSync',
  message: 'Calendar sync failed',
  detail: null,
  read_at: '2026-04-29 00:10:00',
  resolved_at: '2026-04-29 00:11:00',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AlertsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(useAlerts).mockReturnValue({
    data: { alerts: [activeAlert, resolvedAlert], unread_count: 1, active_count: 1 },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAlerts>);
  markRead.mockReset();
  resolveAlert.mockReset();
  unresolveAlert.mockReset();
});

describe('AlertsPage', () => {
  it('renders alerts in a sortable/filterable table', () => {
    renderPage();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter alerts by severity')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter alerts by source')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter alerts by message')).toBeInTheDocument();
    expect(screen.getByText('Note extraction failed')).toBeInTheDocument();
    expect(screen.getByText('Calendar sync failed')).toBeInTheDocument();
  });

  it('can resolve and reopen alerts from the table actions', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(resolveAlert).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(unresolveAlert).toHaveBeenCalledWith(2);
  });

  it('filters locally by message text', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Filter alerts by message'), 'calendar');

    expect(screen.getByText('Calendar sync failed')).toBeInTheDocument();
    expect(screen.queryByText('Note extraction failed')).not.toBeInTheDocument();
  });
});
