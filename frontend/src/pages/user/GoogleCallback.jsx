import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { auth, me } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { PENDING_JOIN_KEY } from '@/auth/pendingJoin';
import { Card, CardBody } from '@/components/ui/Card';
import { FullPageSpinner } from '@/components/ui/Spinner';

/**
 * Where GOOGLE_REDIRECT_URI points. Google redirects the browser here with
 * ?code&state, and this page exchanges that code for a session - the only
 * step that happens client-side rather than in the backend.
 */
export default function GoogleCallback() {
  const { adoptTokens } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const [redirectTo, setRedirectTo] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError('Google sign-in was cancelled.');
      return;
    }
    if (!code) {
      setError('This link is missing what Google should have sent back.');
      return;
    }

    auth.googleCallback({ code, state })
      .then((pair) => adoptTokens(pair))
      .then(async () => {
        // Resume a "join this queue" intent stashed before the redirect to
        // Google, so picking a service isn't lost by needing to sign in.
        const raw = localStorage.getItem(PENDING_JOIN_KEY);
        localStorage.removeItem(PENDING_JOIN_KEY);
        if (!raw) return '/profile';
        try {
          const { tenantId, branchId, serviceId } = JSON.parse(raw);
          const token = await me.joinQueue(tenantId, { service_id: serviceId, branch_id: branchId });
          return `/track/${token.id}`;
        } catch {
          return '/profile';
        }
      })
      .then((to) => setRedirectTo(to))
      .catch((err) => setError(err.message ?? 'Could not complete sign-in.'));
  }, [searchParams, adoptTokens]);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  if (error) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <Card>
          <CardBody className="space-y-3 text-center">
            <h1 className="text-base font-semibold">Sign-in didn&apos;t go through</h1>
            <p className="text-sm text-muted">{error}</p>
            <Link to="/find" className="inline-block text-sm text-signal hover:underline">
              Back to Find a place
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return <FullPageSpinner label="Finishing sign-in" />;
}
