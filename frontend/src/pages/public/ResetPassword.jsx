import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await auth.resetPassword({ token, new_password: values.new_password });
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.message ?? 'Could not reset your password.');
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
                  This reset link is missing its token. Request a new one from the sign-in page.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">Choose a new password</h1>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field label="New password" htmlFor="new_password" error={errors.new_password?.message} required>
                    <Input
                      id="new_password" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.new_password)}
                      {...register('new_password', {
                        required: 'Enter a new password.',
                        minLength: { value: 10, message: 'Must be at least 10 characters.' },
                      })}
                    />
                  </Field>

                  <Field
                    label="Confirm new password" htmlFor="confirm_password"
                    error={errors.confirm_password?.message} required
                  >
                    <Input
                      id="confirm_password" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.confirm_password)}
                      {...register('confirm_password', {
                        validate: (value) => value === watch('new_password') || 'Passwords do not match.',
                      })}
                    />
                  </Field>

                  <Button type="submit" className="w-full" loading={submitting}>
                    Change password
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
