import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/** The one way back to a sensible parent screen — same convention everywhere. */
export function BackLink({ to, label, className }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

BackLink.propTypes = {
  to: PropTypes.string.isRequired,
  label: PropTypes.node.isRequired,
  className: PropTypes.string,
};
