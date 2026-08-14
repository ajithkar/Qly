import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import { Dialog } from '@/components/ui/Dialog';
import { VendorSignInForm } from './VendorSignInForm';

/** The landing page's "Sign in" / "I Run a Clinic" entry points open this in
 * place instead of navigating to /login - that page still exists on its own
 * for the redirects that depend on it (session expiry, logout, invites). */
export function VendorSignInModal({ open, onClose }) {
  const navigate = useNavigate();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Vendor sign in"
      description="Customers sign in with Google from the booking page."
    >
      <VendorSignInForm
        onSuccess={() => {
          onClose();
          navigate('/vendor');
        }}
      />
    </Dialog>
  );
}

VendorSignInModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
