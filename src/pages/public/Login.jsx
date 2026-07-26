import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  if (!loading && isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname ?? '/vendor'} replace />;
  }

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await login(values);
      navigate(location.state?.from?.pathname ?? '/vendor', { replace: true });
    } catch (error) {
      // The server returns one message for unknown email and wrong password
      // alike, so we do not leak which accounts exist.
      toast.error(error.message ?? 'Could not sign you in.');
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
            <div>
              <h1 className="text-base font-semibold tracking-tight">Vendor sign in</h1>
              <p className="mt-0.5 text-sm text-muted">
                Customers sign in with Google from the booking page.
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

              <Field label="Password" htmlFor="password" error={errors.password?.message} required>
                <Input
                  id="password" type="password" autoComplete="current-password"
                  invalid={Boolean(errors.password)}
                  {...register('password', { required: 'Enter your password.' })}
                />
              </Field>

              <Button type="submit" className="w-full" loading={submitting}>
                Sign in
              </Button>
            </form>

            <div className="flex justify-between text-sm">
              <Link to="/forgot-password" className="text-muted hover:text-ink">
                Forgot password
              </Link>
              <Link to="/register" className="text-signal hover:underline">
                Create an account
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
