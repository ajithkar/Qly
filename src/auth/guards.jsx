/** Route guards. These shape navigation; the API enforces the real rules. */
import PropTypes from 'prop-types';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal';
import { FullPageSpinner } from '@/components/ui/Spinner';

export function RequireAuth({ principalType }) {
  const { isAuthenticated, loading, principal } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  if (!isAuthenticated) {
    const to = principalType === 'admin' ? '/admin/login'
      : principalType === 'user' ? '/find'
      : '/login';
    return <Navigate to={to} state={{ from: location }} replace />;
  }
  if (principalType && principal.principal_type !== principalType) {
    return <Navigate to="/" replace />;
  }
  // A temp password (e.g. after Stripe activation) must be replaced before
  // the dashboard is usable. The outlet still renders underneath so the
  // chrome isn't a blank flash - the modal has no dismiss path of its own.
  if (principal.principal_type === 'staff' && principal.must_change_password) {
    return (
      <>
        <Outlet />
        <ChangePasswordModal />
      </>
    );
  }
  return <Outlet />;
}

RequireAuth.propTypes = { principalType: PropTypes.string };

/** Hides children when the permission is absent. Renders `fallback` instead. */
export function Can({ permission, children, fallback = null }) {
  const { can } = useAuth();
  return can(permission) ? children : fallback;
}

Can.propTypes = {
  permission: PropTypes.string.isRequired,
  children: PropTypes.node,
  fallback: PropTypes.node,
};
