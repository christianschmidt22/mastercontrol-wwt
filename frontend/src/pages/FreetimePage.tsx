import { useMemo, useState } from 'react';
import { CalendarSearch, UserRoundPlus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useAllContacts } from '../api/useContacts';
import { useFindFreetime } from '../api/useFreetime';
import { PONDERING_PROMPT, PONDERING_RESPONSES } from '../data/ponderingResponses';
import type { Contact } from '../types';

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const TIME_OPTIONS = Array.from({ length: ((18 - 6) * 2) + 1 }, (_, index) => (6 * 60) + (index * 30));
const MINIMUM_WINDOW_OPTIONS = [30, 60, 90, 120] as const;

const fieldStyle = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 4,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 12,
  padding: '6px 8px',
  boxSizing: 'border-box' as const,
};

function buttonStyle(disabled = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid var(--rule)',
    borderRadius: 5,
    background: 'var(--bg)',
    color: disabled ? 'var(--ink-3)' : 'var(--ink-2)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--body)',
    fontSize: 12,
    padding: '7px 10px',
  };
}

function searchButtonStyle(disabled = false) {
  return {
    ...buttonStyle(disabled),
    borderColor: disabled ? 'var(--rule)' : 'var(--accent)',
    color: disabled ? 'var(--ink-3)' : 'var(--ink-1)',
    fontSize: 15,
    fontWeight: 700,
    justifyContent: 'center',
    minWidth: 220,
    padding: '11px 18px',
  };
}

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minutesLabel(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours}:${String(mins).padStart(2, '0')} ${suffix}`;
}

function isWwtContact(contact: Contact): boolean {
  return contact.role === 'wwt_resource' || contact.email?.toLowerCase().endsWith('@wwt.com') === true;
}

export function FreetimePage() {
  const contactsQuery = useAllContacts();
  const findFreetime = useFindFreetime();
  const ponderingResponse = useMemo(
    () => PONDERING_RESPONSES[Math.floor(Math.random() * PONDERING_RESPONSES.length)] ?? PONDERING_RESPONSES[0],
    [],
  );
  const [filter, setFilter] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startMinutes, setStartMinutes] = useState(8 * 60);
  const [endMinutes, setEndMinutes] = useState(16 * 60);
  const [minimumDurationMinutes, setMinimumDurationMinutes] = useState<30 | 60 | 90 | 120>(30);
  const [startDate, setStartDate] = useState(localDate());
  const [endDate, setEndDate] = useState(localDate(14));

  const wwtContacts = useMemo(
    () => (contactsQuery.data ?? []).filter((contact) => isWwtContact(contact) && contact.email),
    [contactsQuery.data],
  );
  const filteredContacts = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return wwtContacts.filter((contact) => {
      if (!needle) return true;
      return [contact.name, contact.title, contact.email]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [filter, wwtContacts]);

  const toggleEmail = (email: string) => {
    setSelectedEmails((current) => {
      if (current.includes(email)) return current.filter((item) => item !== email);
      if (current.length >= 4) return current;
      return [...current, email];
    });
  };

  const toggleDay = (day: number) => {
    setWeekdays((current) => (
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day].sort((a, b) => a - b)
    ));
  };

  const canSearch = (
    (includeSelf || selectedEmails.length > 0)
    && weekdays.length > 0
    && endMinutes - startMinutes >= minimumDurationMinutes
    && !findFreetime.isPending
  );

  const handleStartTimeChange = (minutes: number) => {
    setStartMinutes(minutes);
    if (endMinutes - minutes < 30) {
      setEndMinutes(Math.min(minutes + 30, 18 * 60));
    }
  };

  const handleEndTimeChange = (minutes: number) => {
    setEndMinutes(minutes);
    if (minutes - startMinutes < 30) {
      setStartMinutes(Math.max(minutes - 30, 6 * 60));
    }
  };

  const runSearch = () => {
    if (!canSearch) return;
    findFreetime.mutate({
      participant_emails: selectedEmails,
      include_self: includeSelf,
      start_date: startDate,
      end_date: endDate,
      weekdays,
      work_start_minutes: startMinutes,
      work_end_minutes: endMinutes,
      minimum_duration_minutes: minimumDurationMinutes,
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow={PONDERING_PROMPT}
        title="Freetime"
        subtitle={ponderingResponse}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 430px) minmax(420px, 1fr)', gap: 16, alignItems: 'start' }}>
        <section style={{ border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--surface)', padding: 16, display: 'grid', gap: 14, alignSelf: 'start', alignContent: 'start' }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>WWT users</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--ink-3)', fontSize: 13 }}>
              Select up to four local WWT contacts. Add more from Contacts.
            </p>
          </div>
          <input
            aria-label="Filter WWT users"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by name, title, email"
            style={fieldStyle}
          />
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--rule)', borderRadius: 6 }}>
            {contactsQuery.isLoading && <p style={{ margin: 10, color: 'var(--ink-3)', fontSize: 13 }}>Loading...</p>}
            {!contactsQuery.isLoading && filteredContacts.length === 0 && (
              <p style={{ margin: 10, color: 'var(--ink-3)', fontSize: 13 }}>No WWT contacts found locally.</p>
            )}
            {filteredContacts.map((contact) => {
              const email = contact.email ?? '';
              const checked = selectedEmails.includes(email);
              const disabled = !checked && selectedEmails.length >= 4;
              return (
                <label
                  key={contact.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '18px 1fr',
                    gap: 8,
                    padding: '9px 10px',
                    borderBottom: '1px solid var(--rule)',
                    color: disabled ? 'var(--ink-3)' : 'var(--ink-1)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleEmail(email)} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{contact.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{contact.title ?? email}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <button type="button" onClick={() => setFilter('')} style={buttonStyle()}>
            <UserRoundPlus size={13} aria-hidden="true" />
            Add another person
          </button>
        </section>

        <section style={{ border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--surface)', padding: 16, display: 'grid', gap: 16, alignSelf: 'start', alignContent: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              Start date
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              End date
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={fieldStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(140px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              Start time
              <select value={startMinutes} onChange={(event) => handleStartTimeChange(Number(event.target.value))} style={fieldStyle}>
                {TIME_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              End time
              <select value={endMinutes} onChange={(event) => handleEndTimeChange(Number(event.target.value))} style={fieldStyle}>
                {TIME_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              Minimum opening
              <select
                value={minimumDurationMinutes}
                onChange={(event) => setMinimumDurationMinutes(Number(event.target.value) as 30 | 60 | 90 | 120)}
                style={fieldStyle}
              >
                {MINIMUM_WINDOW_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} minutes</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DAYS.map((day) => (
              <label key={day.value} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
                <input type="checkbox" checked={weekdays.includes(day.value)} onChange={() => toggleDay(day.value)} />
                {day.label}
              </label>
            ))}
          </div>

          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={includeSelf} onChange={(event) => setIncludeSelf(event.target.checked)} />
            Include me in the calculation
          </label>

          {findFreetime.isError && (
            <p role="alert" style={{ margin: 0, color: 'var(--accent)', fontSize: 13 }}>{findFreetime.error.message}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 48px 0 0' }}>
            <button type="button" onClick={runSearch} disabled={!canSearch} style={searchButtonStyle(!canSearch)}>
              <CalendarSearch size={18} aria-hidden="true" />
              {findFreetime.isPending ? 'Searching...' : 'Search availability'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
            <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>
              Shared openings
            </h2>
            {!findFreetime.data && <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>Run a search to compare availability.</p>}
            {findFreetime.data && (
              <div style={{ display: 'grid', gap: 10 }}>
                <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 12 }}>
                  Compared {findFreetime.data.participants.length} calendar{findFreetime.data.participants.length === 1 ? '' : 's'}.
                  {findFreetime.data.unresolved.length > 0 ? ` Unresolved: ${findFreetime.data.unresolved.join(', ')}` : ''}
                </p>
                {findFreetime.data.slots.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>No shared openings found in that window.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--body)' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--rule)' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--rule)' }}>Time</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid var(--rule)' }}>Minutes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findFreetime.data.slots.map((slot) => (
                        <tr key={`${slot.start_at}-${slot.end_at}`}>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>{slot.date}</td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>{slot.start_time} - {slot.end_time} CT</td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--rule)', textAlign: 'right', fontSize: 13 }}>{slot.duration_minutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
