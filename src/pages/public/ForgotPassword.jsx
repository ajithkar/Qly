import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';

export default function ForgotPassword() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await auth.forgotPassword(values.email);
    } finally {
      // The backend never reveals whether an address is registered, so the
      // UI shows the same confirmation regardless of the outcome.
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 block text-center font-mono text-sm font-bold">
          Qly
        </Link>
        <Card>
          <CardBody className="space-y-5">
            {sent ? (
              <div>
                <h1 className="text-base font-semibold tracking-tight">Check your email</h1>
                <p className="mt-1.5 text-sm text-muted">
                  If that address is registered, we&apos;ve sent a link to reset your password.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">Reset your password</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field label="Email" htmlFor="email" error={errors.email?.message} required>
                    <Input
                      id="email" type="email" autoComplete="email"
                      invalid={Boolean(errors.email)}
                      {...register('email', { required: 'Enter your email address.' })}
                    />
                  </Field>

                  <Button type="submit" className="w-full" loading={submitting}>
                    Send reset link
                  </Button>
                </form>
              </>
            )}

            <div className="text-center text-sm">
              <Link to="/login" className="text-muted hover:text-ink">
                Back to sign in
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
