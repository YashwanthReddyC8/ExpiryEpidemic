import { getExpiryUrgency } from '../../utils/expiry';
import { clsx } from 'clsx';

const STYLES = {
  expired:  'bg-red-100 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-600 border-red-200',
  urgent:   'bg-orange-100 text-orange-600 border-orange-200',
  warning:  'bg-amber-100 text-amber-700 border-amber-200',
  safe:     'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const LABELS = {
  expired:  'Expired',
  critical: (d) => `${d}d left`,
  urgent:   (d) => `${d}d left`,
  warning:  (d) => `${d}d left`,
  safe:     (d) => `${d}d left`,
};

export default function ExpiryBadge({ days }) {
  const urgency = getExpiryUrgency(days);
  const labelFn = LABELS[urgency];
  const label = typeof labelFn === 'function' ? labelFn(days) : labelFn;
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border',
        STYLES[urgency]
      )}
    >
      {label}
    </span>
  );
}
