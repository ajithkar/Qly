import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import logoMark from '@/assets/logo-mark.png';
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
  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm();
  const newPassword = watch('new_password');

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await auth.resetPassword({ token, new_password: values.new_password });
      toast.success('Password updated. Sign in with your new password.');
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
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-mono text-sm font-bold">
          <img src={logoMark} alt="" className="h-7 w-7" aria-hidden="true" />
          Qly
        </Link>
        <Card>
          <CardBody className="space-y-5">
            {!token ? (
              <div className="space-y-4 text-center">
                <h1 className="text-base font-semibold tracking-tight">Link invalid</h1>
                <p className="text-sm text-muted">
                  This reset link is missing its token. Request a new one.
                </p>
                <Link to="/forgot-password">
                  <Button variant="secondary" className="w-full">Request a new link</Button>
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">Choose a new password</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    This will sign you out everywhere else.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field
                    label="New password" htmlFor="rp-password" error={errors.new_password?.message} required
                    hint="At least 10 characters, with an uppercase letter, a lowercase letter and a digit."
                  >
                    <Input
                      id="rp-password" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.new_password)}
                      {...register('new_password', {
                        required: 'Choose a new password.',
                        minLength: { value: 10, message: 'At least 10 characters.' },
                      })}
                    />
                  </Field>

                  <Field
                    label="Confirm password" htmlFor="rp-password-confirm"
                    error={errors.password_confirm?.message} required
                  >
                    <Input
                      id="rp-password-confirm" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.password_confirm)}
                      {...register('password_confirm', {
                        required: 'Confirm your new password.',
                        validate: (value) => value === newPassword || 'Passwords do not match.',
                      })}
                    />
                  </Field>

                  <Button type="submit" className="w-full" loading={submitting}>
                    Update password
                  </Button>
                </form>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
