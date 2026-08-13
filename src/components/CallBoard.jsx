import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { cn, formatCountdown, parseServerDate } from '@/lib/cn';

/**
 * The call board.
 *
 * This is the one loud element in the product, and it earns that because the
 * token number *is* the artifact — the thing a person cranes their neck to
 * read from across a waiting room. Oversized tabular mono numerals on an
 * inset dark plate, deliberately referencing physical call-board hardware.
 *
 * The brief flash on a newly called token is real feedback, not decoration:
 * an operator glancing back at the screen needs to know the call registered.
 * It fires three times and stops, and is suppressed under reduced-motion.
 */
export function CallBoard({ token, averageServiceMinutes, label = 'Now serving', size = 'lg' }) {
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tokenNumber = token?.token_number;
  const calledAt = token?.called_at;

  useEffect(() => {
    if (!tokenNumber) return undefined;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 3600);
    return () => clearTimeout(timer);
  }, [tokenNumber]);

  // Ticks the balance-time countdown once a second while someone is
  // actually being served - this is the one number the doctor glances at
  // to know how much of the appointment slot is left.
  useEffect(() => {
    if (!calledAt) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [calledAt]);

  const isEmpty = !tokenNumber;
  const balanceSeconds = calledAt && averageServiceMinutes
    ? averageServiceMinutes * 60 - (now - parseServerDate(calledAt).getTime()) / 1000
    : null;

  return (
    <div
      className={cn(
        'call-board call-board-grid relative overflow-hidden rounded-card',
        size === 'lg' ? 'px-8 py-10' : 'px-6 py-6',
      )}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
        {label}
      </p>

      <p
        aria-live="polite"
        className={cn(
          'mt-3 font-mono font-bold tabular text-white',
          size === 'lg' ? 'text-token' : 'text-token-sm',
          isEmpty && 'text-white/25',
          flash && !isEmpty && 'animate-called',
        )}
      >
        {tokenNumber ?? '—'}
      </p>

      {token?.customer_name && (
        <p className="mt-2 truncate text-sm text-white/60">{token.customer_name}</p>
      )}

      {balanceSeconds !== null && (
        <p className="mt-2 font-mono text-sm tabular text-white/60">
          Balance time{' '}
          <span className={cn('font-bold', balanceSeconds < 0 ? 'text-amber' : 'text-white')}>
            {balanceSeconds < 0 && '+'}
            {formatCountdown(Math.abs(balanceSeconds))}
          </span>
        </p>
      )}

      {isEmpty && (
        <p className="mt-2 text-sm text-white/40">
          Nobody has been called yet
        </p>
      )}

      {/* A single amber bulb, lit only while someone is actually being served. */}
      <span
        className={cn(
          'absolute right-6 top-6 h-2.5 w-2.5 rounded-full',
          isEmpty ? 'bg-white/15' : 'bg-amber shadow-[0_0_12px_2px_rgb(232_163_61/0.6)]',
        )}
        aria-hidden="true"
      />
    </div>
  );
}

CallBoard.propTypes = {
  token: PropTypes.shape({
    token_number: PropTypes.string,
    customer_name: PropTypes.string,
    called_at: PropTypes.string,
  }),
  averageServiceMinutes: PropTypes.number,
  label: PropTypes.string,
  size: PropTypes.oneOf(['lg', 'sm']),
};

/** The upcoming queue, shown as a stack of numerals under the board. */
export function UpNext({ tokens = [] }) {
  if (!tokens.length) {
    return (
      <p className="px-1 py-3 text-sm text-muted">Nobody is waiting.</p>
    );
  }

  return (
    <ol className="divide-y divide-line">
      {tokens.map((token, index) => (
        <li
          key={token.id}
          className="flex items-center justify-between gap-3 py-2.5"
        >
          <div className="flex items-center gap-3">
            <span className="w-5 text-xs tabular text-muted">{index + 1}</span>
            <span className="font-mono text-lg font-bold tabular">
              {token.token_number}
            </span>
            {token.priority !== 'normal' && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  token.priority === 'emergency'
                    ? 'bg-rose/15 text-rose'
                    : 'bg-amber/15 text-amber',
                )}
              >
                {token.priority}
              </span>
            )}
          </div>
          <span className="truncate text-sm text-muted">
            {token.customer_name || 'Walk-in'}
          </span>
        </li>
      ))}
    </ol>
  );
}

UpNext.propTypes = { tokens: PropTypes.array };
