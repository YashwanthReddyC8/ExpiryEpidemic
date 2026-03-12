/**
 * Expiry utility helpers shared across the app.
 */

/** Returns the urgency tier based on days to expiry */
export function getExpiryUrgency(days) {
  if (days <= 0) return 'expired';
  if (days <= 7)  return 'critical';
  if (days <= 30) return 'urgent';
  if (days <= 60) return 'warning';
  return 'safe';
}

/** Returns a Tailwind color class for text */
export function getExpiryColor(days) {
  const map = {
    expired:  'text-red-600',
    critical: 'text-red-500',
    urgent:   'text-orange-500',
    warning:  'text-amber-500',
    safe:     'text-emerald-600',
  };
  return map[getExpiryUrgency(days)] ?? 'text-gray-500';
}

/** Returns a Tailwind bg class for row/card tinting */
export function getExpiryBg(days) {
  const map = {
    expired:  'bg-red-50',
    critical: 'bg-red-50',
    urgent:   'bg-orange-50',
    warning:  'bg-amber-50',
    safe:     'bg-white',
  };
  return map[getExpiryUrgency(days)] ?? 'bg-gray-50';
}

/** Returns a Tailwind border-left color for KPI cards */
export function getExpiryBorder(days) {
  const map = {
    expired:  'border-l-red-500',
    critical: 'border-l-red-400',
    urgent:   'border-l-orange-400',
    warning:  'border-l-amber-400',
    safe:     'border-l-emerald-400',
  };
  return map[getExpiryUrgency(days)] ?? 'border-l-gray-300';
}

/** Returns Recharts fill color hex */
export function getExpiryChartColor(weekIndex) {
  if (weekIndex < 2) return '#EF4444';
  if (weekIndex < 4) return '#F97316';
  if (weekIndex < 6) return '#F59E0B';
  return '#10B981';
}

/** Format ISO date string → "15 Feb 2025" */
export function formatExpiryDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format number as Indian rupees */
export function formatINR(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
