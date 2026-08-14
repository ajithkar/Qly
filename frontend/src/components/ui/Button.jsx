import PropTypes from 'prop-types';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-signal text-white shadow-soft hover:bg-signal-strong hover:shadow-elevated hover:-translate-y-0.5 active:translate-y-0',
  secondary:
    'bg-surface text-ink border border-line shadow-soft hover:bg-paper hover:shadow-elevated hover:-translate-y-0.5 active:translate-y-0',
  ghost: 'text-secondary hover:text-ink hover:bg-paper',
  danger:
    'bg-rose text-white shadow-soft hover:brightness-110 hover:shadow-elevated hover:-translate-y-0.5 active:translate-y-0',
  jade: 'bg-jade text-white shadow-soft hover:brightness-110 hover:shadow-elevated hover:-translate-y-0.5 active:translate-y-0',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  xl: 'h-16 px-8 text-lg font-semibold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  ...rest
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-button font-medium',
        'transition duration-150 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-soft',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(Object.keys(VARIANTS)),
  size: PropTypes.oneOf(Object.keys(SIZES)),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};
