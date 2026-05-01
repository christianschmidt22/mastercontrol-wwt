import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from './http';
import type { CalendarTodayResponse, AlertsResponse } from '../types';
import type { SystemAlert } from '../types';

function todayDateStr(): string {
  // Use LOCAL date components — toISOString() returns UTC, which rolls to
  // the next day in evening hours west of UTC and produces "tomorrow" in
  // the user's perception (Today's Agenda timezone bug).
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const calendarKeys = {
  today: (date: string) => ['calendar', 'today', date] as const,
  alerts: (filters: AlertFilters = {}) => ['alerts', filters] as const,
  alertCount: () => ['alerts', 'count'] as const,
};

export interface AlertFilters {
  status?: 'active' | 'unread' | 'unresolved' | 'resolved' | 'all';
  severity?: SystemAlert['severity'] | 'all';
  source?: string;
  limit?: number;
  unreadOnly?: boolean;
}

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

export function useHideEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, date }: { uid: string; date: string }) =>
      request<{ ok: boolean }>('POST', `/api/calendar/events/${encodeURIComponent(uid)}/hide?date=${date}`),
    onMutate: async ({ uid, date }) => {
      await qc.cancelQueries({ queryKey: calendarKeys.today(date) });
      const previous = qc.getQueryData<CalendarTodayResponse>(calendarKeys.today(date));
      if (previous) {
        const moved = previous.events.find((e) => e.uid === uid);
        qc.setQueryData<CalendarTodayResponse>(calendarKeys.today(date), {
          ...previous,
          events: previous.events.filter((e) => e.uid !== uid),
          hidden_events: moved ? [...previous.hidden_events, moved] : previous.hidden_events,
        });
      }
      return { previous };
    },
    onError: (_err, { date }, ctx) => {
      if (ctx?.previous) qc.setQueryData(calendarKeys.today(date), ctx.previous);
    },
    onSettled: (_data, _err, { date }) => {
      void qc.invalidateQueries({ queryKey: calendarKeys.today(date) });
    },
  });
}

export function useUnhideEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, date }: { uid: string; date: string }) =>
      request<{ ok: boolean }>('POST', `/api/calendar/events/${encodeURIComponent(uid)}/unhide?date=${date}`),
    onMutate: async ({ uid, date }) => {
      await qc.cancelQueries({ queryKey: calendarKeys.today(date) });
      const previous = qc.getQueryData<CalendarTodayResponse>(calendarKeys.today(date));
      if (previous) {
        const moved = previous.hidden_events.find((e) => e.uid === uid);
        qc.setQueryData<CalendarTodayResponse>(calendarKeys.today(date), {
          ...previous,
          hidden_events: previous.hidden_events.filter((e) => e.uid !== uid),
          events: moved ? [...previous.events, moved] : previous.events,
        });
      }
      return { previous };
    },
    onError: (_err, { date }, ctx) => {
      if (ctx?.previous) qc.setQueryData(calendarKeys.today(date), ctx.previous);
    },
    onSettled: (_data, _err, { date }) => {
      void qc.invalidateQueries({ queryKey: calendarKeys.today(date) });
    },
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

export function useAlerts(filtersOrUnread: AlertFilters | boolean = {}) {
  const filters: AlertFilters =
    typeof filtersOrUnread === 'boolean' ? { unreadOnly: filtersOrUnread } : filtersOrUnread;
  return useQuery({
    queryKey: calendarKeys.alerts(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.unreadOnly) params.set('unread_only', 'true');
      if (filters.status) params.set('status', filters.status);
      if (filters.severity && filters.severity !== 'all') params.set('severity', filters.severity);
      if (filters.source) params.set('source', filters.source);
      if (filters.limit !== undefined) params.set('limit', String(filters.limit));
      const qs = params.toString();
      return request<AlertsResponse>('GET', qs ? `/api/alerts?${qs}` : '/api/alerts');
    },
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

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ ok: boolean }>('POST', `/api/alerts/${id}/resolve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useUnresolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ ok: boolean }>('POST', `/api/alerts/${id}/unresolve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
