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

/** ISO string → local time, e.g. "2:45 PM". */
export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
