import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { auth } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
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
  const [done, setDone] = useState(false);
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
      .then(() => setDone(true))
      .catch((err) => setError(err.message ?? 'Could not complete sign-in.'));
  }, [searchParams, adoptTokens]);

  if (done) return <Navigate to="/profile" replace />;

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
