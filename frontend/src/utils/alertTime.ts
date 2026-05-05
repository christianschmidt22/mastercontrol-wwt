const ALERT_TIME_ZONE = 'America/Chicago';

function parseAlertTimestamp(value: string): Date {
  const trimmed = value.trim();
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = hasExplicitZone
    ? trimmed
    : `${trimmed.replace(' ', 'T')}Z`;
  return new Date(normalized);
}

export function formatAlertTimestamp(value: string | null): string {
  if (!value) return '-';
  const date = parseAlertTimestamp(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: ALERT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)} CT`;
}
