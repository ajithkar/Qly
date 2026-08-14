/** Join class names, dropping falsy values. */
export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

/** Minutes → a short human string. "18m", "1h 05m". */
export function formatMinutes(minutes) {
  if (minutes == null) return '—';
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  return `${hours}h ${String(total % 60).padStart(2, '0')}m`;
}

/**
 * Server timestamps are UTC but arrive with no timezone suffix (Mongo hands
 * back naive datetimes on read) - without this, `new Date(iso)` treats them
 * as local time and every duration/countdown built from them is wrong by
 * the viewer's UTC offset. Every place that turns a server ISO string into
 * a Date should go through this, not `new Date()` directly.
 */
export function parseServerDate(iso) {
  if (!iso) return null;
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

/** ISO string → local time, e.g. "2:45 PM". */
export function formatTime(iso) {
  if (!iso) return '—';
  return parseServerDate(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Seconds → "M:SS" for a live countdown. Negative values clamp to 0:00. */
export function formatCountdown(totalSeconds) {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return parseServerDate(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
