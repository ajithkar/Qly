import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Find a clinic', to: '/find' },
      { label: 'Track my token', to: '/find' },
    ],
  },
  {
    heading: 'For clinics',
    links: [
      { label: 'See a demo', to: '/demo' },
      { label: 'Sign in', action: 'signin' },
    ],
  },
];

export function Footer({ onSignIn }) {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-sm font-semibold text-ink">{column.heading}</p>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.action === 'signin' ? (
                      <button
                        type="button" onClick={onSignIn}
                        className="text-sm text-secondary hover:text-ink"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <Link to={link.to} className="text-sm text-secondary hover:text-ink">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-sm font-semibold text-ink">Legal</p>
            <ul className="mt-3 space-y-2.5">
              <li className="text-sm text-muted">Privacy</li>
              <li className="text-sm text-muted">Terms</li>
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-xs text-muted">
          © {new Date().getFullYear()} Qly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

Footer.propTypes = {
  onSignIn: PropTypes.func.isRequired,
};
