import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await auth.acceptInvite({ token, password: values.password });
      toast.success('Account activated. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.message ?? 'Could not accept this invite.');
    } finally {
      setSubmitting(false);
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
            {!token ? (
              <div>
                <h1 className="text-base font-semibold tracking-tight">Invalid link</h1>
                <p className="mt-1.5 text-sm text-muted">
                  This invite link is missing its token. Ask whoever invited you to send a new one.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">Set your password</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    Choose a password to activate your account.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field label="Password" htmlFor="password" error={errors.password?.message} required>
                    <Input
                      id="password" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.password)}
                      {...register('password', {
                        required: 'Choose a password.',
                        minLength: { value: 10, message: 'Must be at least 10 characters.' },
                      })}
                    />
                  </Field>

                  <Field
                    label="Confirm password" htmlFor="confirm_password"
                    error={errors.confirm_password?.message} required
                  >
                    <Input
                      id="confirm_password" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.confirm_password)}
                      {...register('confirm_password', {
                        validate: (value) => value === watch('password') || 'Passwords do not match.',
                      })}
                    />
                  </Field>

                  <Button type="submit" className="w-full" loading={submitting}>
                    Activate account
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
