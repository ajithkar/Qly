import PropTypes from 'prop-types';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-signal text-white hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface text-ink border border-line hover:bg-paper',
  ghost: 'text-muted hover:text-ink hover:bg-paper',
  danger: 'bg-rose text-white hover:brightness-110',
  jade: 'bg-jade text-white hover:brightness-110',
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
        'inline-flex items-center justify-center gap-2 rounded-card font-medium',
        'transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
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
