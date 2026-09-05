// Helper functions for timezone formatting (IST: UTC+5:30)

export function formatIST(ts, includeSeconds = false) {
  if (!ts) return '--';
  const date = new Date(ts);
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: true
  }) + ' IST';
}

export function formatISTTimeOnly(ts) {
  if (!ts) return '--';
  const date = new Date(ts);
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' IST';
}

export function formatUTC(ts) {
  if (!ts) return '--';
  const date = new Date(ts);
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}
