import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from './http';
import type { CalendarTodayResponse, AlertsResponse } from '../types';

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const calendarKeys = {
  today: (date: string) => ['calendar', 'today', date] as const,
  alerts: (unreadOnly: boolean) => ['alerts', unreadOnly] as const,
  alertCount: () => ['alerts', 'count'] as const,
};

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function useCalendarToday(dateStr?: string) {
  const date = dateStr ?? todayDateStr();
  return useQuery({
    queryKey: calendarKeys.today(date),
    queryFn: () => request<CalendarTodayResponse>('GET', `/api/calendar/today?date=${date}`),
    staleTime: 5 * 60 * 1000, // 5 min — data comes from local cache, very fast
  });
}

export function useCalendarSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ ok: boolean; upserted: number; pruned: number }>('POST', '/api/calendar/sync'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar'] });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export function useAlerts(unreadOnly = false) {
  return useQuery({
    queryKey: calendarKeys.alerts(unreadOnly),
    queryFn: () => request<AlertsResponse>('GET', `/api/alerts?unread_only=${unreadOnly}`),
    refetchInterval: 60_000, // poll every 60 s for new failures
  });
}

export function useAlertCount() {
  return useQuery({
    queryKey: calendarKeys.alertCount(),
    queryFn: () => request<{ unread_count: number }>('GET', '/api/alerts/count'),
    refetchInterval: 60_000,
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ ok: boolean }>('POST', `/api/alerts/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useMarkAllAlertsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ ok: boolean; marked: number }>('POST', '/api/alerts/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
