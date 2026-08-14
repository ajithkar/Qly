import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthContext';
import { VendorSignInForm } from '@/components/auth/VendorSignInForm';
import { BackLink } from '@/components/ui/BackLink';
import { Card, CardBody } from '@/components/ui/Card';

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!loading && isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname ?? '/vendor'} replace />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <BackLink to="/" label="Back to home" className="absolute left-4 top-4 sm:left-6 sm:top-6" />
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 block text-center font-mono text-sm font-bold">
          Qly
        </Link>
        <Card>
          <CardBody className="space-y-5">
            <div>
              <h1 className="text-base font-semibold tracking-tight">Vendor sign in</h1>
              <p className="mt-0.5 text-sm text-muted">
                Customers sign in with Google from the booking page.
              </p>
            </div>

            <VendorSignInForm
              onSuccess={() => navigate(location.state?.from?.pathname ?? '/vendor', { replace: true })}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
