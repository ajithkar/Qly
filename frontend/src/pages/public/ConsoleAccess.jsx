import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { auth } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

/**
 * Where a shared Operator Console link lands. The doctor never sees or types
 * their real password here - just the one-time code an owner/manager handed
 * them, scoped to this exact queue.
 *
 * This page always shows the code form, even if the browser already has a
 * session (e.g. the owner who just generated the link, testing it in the
 * same browser, or a leftover session on a shared/kiosk device). Redeeming
 * the code replaces whatever session was there.
 */
export default function ConsoleAccess() {
  const { queueId } = useParams();
  const { adoptTokens } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const pair = await auth.consoleAccess({ queue_id: queueId, code });
      await adoptTokens(pair);
      navigate(`/vendor/queues/${queueId}/console`, { replace: true });
    } catch (error) {
      toast.error(error.message ?? 'That code did not work.');
    } finally {
      setSubmitting(false);
    }
  };

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
              <h1 className="text-base font-semibold tracking-tight">Operator console access</h1>
              <p className="mt-0.5 text-sm text-muted">
                Enter the one-time code you were given to open this queue&apos;s console.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field label="One-time code" htmlFor="console-code" required>
                <Input
                  id="console-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-[0.3em]"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </Field>

              <Button type="submit" className="w-full" loading={submitting} disabled={code.length !== 6}>
                Open console
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
