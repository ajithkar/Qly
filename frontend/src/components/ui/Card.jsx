import PropTypes from 'prop-types';
import { cn } from '@/lib/cn';

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
Card.propTypes = { className: PropTypes.string, children: PropTypes.node };

export function CardHeader({ title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
CardHeader.propTypes = {
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  action: PropTypes.node,
};

export function CardBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
CardBody.propTypes = { className: PropTypes.string, children: PropTypes.node };

/**
 * A single metric. The label sits above the value because operators scan
 * labels first when they don't yet know which number they need.
 */
export function Stat({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-ink',
    amber: 'text-amber',
    jade: 'text-jade',
    rose: 'text-rose',
    signal: 'text-signal',
  };
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
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
};
