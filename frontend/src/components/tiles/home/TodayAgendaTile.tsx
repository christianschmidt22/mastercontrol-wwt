import { useState } from 'react';
import { RefreshCw, MapPin, Users, X } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import { useCalendarToday, useCalendarSync, useHideEvent, useUnhideEvent } from '../../../api/useCalendar';
import type { CalendarEvent } from '../../../types';

function formatTime(iso: string, isAllDay: boolean): string {
  if (isAllDay) return 'All day';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date(iso));
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced';
  const d = new Date(iso);
  return `Synced ${new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)}`;
}

interface EventRowProps {
  event: CalendarEvent;
  onHide: (uid: string) => void;
  isHidden?: boolean;
  onUnhide?: (uid: string) => void;
}

function EventRow({ event, onHide, isHidden = false, onUnhide }: EventRowProps) {
  const isAllDay = event.is_all_day === 1;
  const time = formatTime(event.start_at, isAllDay);

  return (
    <li
      className="agenda-event-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 12,
        alignItems: 'start',
        paddingBottom: 12,
        borderBottom: '1px solid var(--rule)',
        opacity: isHidden ? 0.55 : 1,
      }}
    >
      <time
        dateTime={event.start_at}
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {time}
      </time>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.4 }}>
          {event.title}
        </span>
        {(event.location || event.attendee_count > 0) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {event.location && (
              <span
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 11, color: 'var(--ink-3)',
                }}
              >
                <MapPin size={10} aria-hidden="true" />
                {event.location}
              </span>
            )}
            {event.attendee_count > 0 && (
              <span
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 11, color: 'var(--ink-3)',
                }}
              >
                <Users size={10} aria-hidden="true" />
                {event.attendee_count} {event.attendee_count === 1 ? 'attendee' : 'attendees'}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ paddingTop: 2 }}>
        {isHidden && onUnhide ? (
          <button
            type="button"
            onClick={() => onUnhide(event.uid)}
            aria-label={`Restore '${event.title}' to today's agenda`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0 2px',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              textDecoration: 'underline',
            }}
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onHide(event.uid)}
            aria-label={`Hide '${event.title}' for today`}
            className="agenda-hide-btn"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0 2px',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export function TodayAgendaTile() {
  const { data, isLoading } = useCalendarToday();
  const { mutate: triggerSync, isPending: isSyncing } = useCalendarSync();
  const { mutate: hideEvent } = useHideEvent();
  const { mutate: unhideEvent } = useUnhideEvent();
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  const dateStr = data?.date ?? new Date().toISOString().slice(0, 10);
  const events = data?.events ?? [];
  const hiddenEvents = data?.hidden_events ?? [];
  const lastSync = data?.last_sync ?? null;

  const handleHide = (uid: string) => hideEvent({ uid, date: dateStr });
  const handleUnhide = (uid: string) => unhideEvent({ uid, date: dateStr });

  return (
    <>
      <style>{`
        .agenda-hide-btn {
          opacity: 0;
          transition: opacity 0.15s;
        }
        @media (prefers-reduced-motion: reduce) {
          .agenda-hide-btn {
            transition: none;
          }
        }
        .agenda-event-row:hover .agenda-hide-btn,
        .agenda-hide-btn:focus-visible {
          opacity: 1;
        }
        .agenda-hide-btn:focus-visible {
          outline: 2px solid var(--ink-1);
          outline-offset: 2px;
          border-radius: 2px;
        }
      `}</style>
      <Tile
        title="Today's Agenda"
        count={isLoading ? '…' : events.length || undefined}
        titleAction={
          <button
            type="button"
            onClick={() => triggerSync()}
            disabled={isSyncing}
            aria-label="Sync calendar"
            title={formatLastSync(lastSync)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: 'none',
              padding: '2px 4px', cursor: isSyncing ? 'wait' : 'pointer',
              fontSize: 11, color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            <RefreshCw
              size={11}
              strokeWidth={1.5}
              aria-hidden="true"
              style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}
            />
            {isSyncing ? 'Syncing…' : 'Sync'}
          </button>
        }
      >
        {isLoading && (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
        )}

        {!isLoading && events.length === 0 && hiddenEvents.length === 0 && (
          <TileEmptyState copy="No meetings scheduled for today." />
        )}

        {events.length > 0 && (
          <ul
            role="list"
            style={{
              listStyle: 'none', margin: 0, padding: 0,
              display: 'flex', flexDirection: 'column',
            }}
          >
            {events.map((event) => (
              <EventRow key={event.uid} event={event} onHide={handleHide} />
            ))}
          </ul>
        )}

        {lastSync && (
          <p style={{ fontSize: 10, color: 'var(--ink-4, var(--ink-3))', margin: '8px 0 0', textAlign: 'right' }}>
            {formatLastSync(lastSync)}
          </p>
        )}

        {hiddenEvents.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
            <button
              type="button"
              onClick={() => setHiddenExpanded((v) => !v)}
              aria-expanded={hiddenExpanded}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--ink-3)',
                fontFamily: 'var(--body)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span aria-hidden="true">{hiddenExpanded ? '▾' : '▸'}</span>
              {hiddenEvents.length} hidden today
            </button>
            {hiddenExpanded && (
              <ul
                role="list"
                style={{
                  listStyle: 'none', margin: '8px 0 0', padding: 0,
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {hiddenEvents.map((event) => (
                  <EventRow
                    key={event.uid}
                    event={event}
                    onHide={handleHide}
                    isHidden
                    onUnhide={handleUnhide}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </Tile>
    </>
  );
}
