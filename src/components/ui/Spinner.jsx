import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`${className} animate-spin text-muted`} aria-hidden="true" />;
}
Spinner.propTypes = { className: PropTypes.string };

export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
FullPageSpinner.propTypes = { label: PropTypes.string };

/** Skeleton rows sized to the table they replace, so layout doesn't jump. */
export function SkeletonRows({ rows = 5, columns = 4 }) {
  return (
    <div className="animate-pulse space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div key={columnIndex} className="h-8 flex-1 rounded bg-line/60" />
          ))}
        </div>
      ))}
    </div>
  );
}
SkeletonRows.propTypes = { rows: PropTypes.number, columns: PropTypes.number };
