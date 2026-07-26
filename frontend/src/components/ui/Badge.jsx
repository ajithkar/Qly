import PropTypes from 'prop-types';
import { cn } from '@/lib/cn';

/** Status colours are consistent platform-wide so they can be learned once. */
const TONES = {
  waiting: 'bg-amber/12 text-amber border-amber/25',
  called: 'bg-signal/12 text-signal border-signal/25',
  serving: 'bg-signal/15 text-signal border-signal/30',
  completed: 'bg-jade/12 text-jade border-jade/25',
  skipped: 'bg-rose/12 text-rose border-rose/25',
  no_show: 'bg-rose/12 text-rose border-rose/25',
  cancelled: 'bg-muted/12 text-muted border-muted/25',
  transferred: 'bg-muted/12 text-muted border-muted/25',
  open: 'bg-jade/12 text-jade border-jade/25',
  paused: 'bg-amber/12 text-amber border-amber/25',
  closed: 'bg-muted/12 text-muted border-muted/25',
  draft: 'bg-muted/12 text-muted border-muted/25',
  neutral: 'bg-muted/12 text-muted border-muted/25',
};

const LABELS = {
  no_show: 'No show',
  waiting: 'Waiting',
  called: 'Called',
  serving: 'Serving',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  transferred: 'Transferred',
};

export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5',
        'text-xs font-medium capitalize',
        TONES[tone] ?? TONES.neutral,
        className,
      )}
    >
      {children ?? LABELS[tone] ?? tone}
    </span>
  );
}

Badge.propTypes = {
  tone: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
};
