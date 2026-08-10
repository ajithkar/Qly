import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * A friendly status card, not a terminal. This is marketing content — the
 * numeral cycles through a small canned sequence so the card feels alive,
 * it isn't bound to a real queue. The real, live version of this idea is
 * CallBoard (src/components/CallBoard.jsx), used on the actual Operator
 * Console and patient tracking page.
 */
const SEQUENCE = [
  { token: 'A014', waiting: 7, eta: '~12 min', progress: 55 },
  { token: 'A015', waiting: 6, eta: '~10 min', progress: 65 },
  { token: 'A016', waiting: 5, eta: '~8 min', progress: 75 },
];

const reducedMotionQuery = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function LiveTokenCard() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotionQuery()) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SEQUENCE.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  const current = SEQUENCE[index];

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full bg-jade opacity-75',
              !reducedMotionQuery() && 'animate-ping',
            )}
            aria-hidden="true"
          />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-jade" aria-hidden="true" />
        </span>
        <span className="text-sm text-secondary">Live at Sunrise Clinic</span>
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted">Now serving</p>
      <p
        aria-live="polite"
        className="mt-1 font-mono text-[2.75rem] font-bold leading-none tabular-nums text-signal sm:text-[4rem]"
      >
        {current.token}
      </p>
      <p className="mt-2 text-sm text-secondary">Room 3 · Dr. Meera Raman</p>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-signal transition-all duration-700 ease-out"
          style={{ width: `${current.progress}%` }}
        />
      </div>

      <div className="mt-5 flex items-center divide-x divide-line text-center">
        <div className="flex-1 pr-3">
          <p className="text-sm font-semibold text-ink">Your token A015</p>
          <p className="text-xs text-muted">Token</p>
        </div>
        <div className="flex-1 px-3">
          <p className="text-sm font-semibold text-ink">{current.waiting} ahead of you</p>
          <p className="text-xs text-muted">In line</p>
        </div>
        <div className="flex-1 pl-3">
          <p className="text-sm font-semibold text-ink">{current.eta}</p>
          <p className="text-xs text-muted">Est. wait</p>
        </div>
      </div>
    </div>
  );
}
