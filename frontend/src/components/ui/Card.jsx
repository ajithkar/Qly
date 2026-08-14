import PropTypes from 'prop-types';
import { cn } from '@/lib/cn';

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface shadow-card', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
Card.propTypes = { className: PropTypes.string, children: PropTypes.node };

export function CardHeader({ title, description, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 rounded-full bg-gradient-to-br from-signal/12 to-jade/8 p-1.5 text-signal">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
CardHeader.propTypes = {
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  action: PropTypes.node,
  icon: PropTypes.elementType,
};

export function CardBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
CardBody.propTypes = { className: PropTypes.string, children: PropTypes.node };

/**
 * A single metric. The label sits above the value because operators scan
 * labels first when they don't yet know which number they need.
 */
export function Stat({ label, value, hint, tone = 'default', icon: Icon }) {
  const tones = {
    default: 'text-ink',
    amber: 'text-amber',
    jade: 'text-jade',
    rose: 'text-rose',
    signal: 'text-signal',
  };
  const washes = {
    default: 'from-muted/5',
    amber: 'from-amber/8',
    jade: 'from-jade/8',
    rose: 'from-rose/8',
    signal: 'from-signal/8',
  };
  return (
    <Card className={cn('relative overflow-hidden bg-gradient-to-br to-transparent px-5 py-4', washes[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        {Icon && (
          <span className={cn('rounded-full bg-surface p-1.5 shadow-soft', tones[tone])}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={cn('mt-2 font-mono text-3xl font-bold tabular', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
Stat.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node,
  hint: PropTypes.node,
  tone: PropTypes.oneOf(['default', 'amber', 'jade', 'rose', 'signal']),
  icon: PropTypes.elementType,
};
