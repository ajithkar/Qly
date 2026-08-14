import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function AdminLogin() {
  const { adoptTokens, isAuthenticated, principal, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  if (!loading && isAuthenticated && principal.principal_type === 'admin') {
    return <Navigate to={location.state?.from?.pathname ?? '/admin'} replace />;
  }

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const pair = await auth.adminLogin({
        email: values.email,
        password: values.password,
        totp_code: values.totp_code || undefined,
      });
      await adoptTokens(pair);
      navigate(location.state?.from?.pathname ?? '/admin', { replace: true });
    } catch (error) {
      toast.error(error.message ?? 'Could not sign you in.');
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
              <h1 className="text-base font-semibold tracking-tight">Super Admin</h1>
              <p className="mt-0.5 text-sm text-muted">
                Platform-wide access. Every action here is audit-logged.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <Field label="Email" htmlFor="a-email" error={errors.email?.message} required>
                <Input
                  id="a-email" type="email" autoComplete="email"
                  invalid={Boolean(errors.email)}
                  {...register('email', { required: 'Enter your email address.' })}
                />
              </Field>

              <Field label="Password" htmlFor="a-password" error={errors.password?.message} required>
                <Input
                  id="a-password" type="password" autoComplete="current-password"
                  invalid={Boolean(errors.password)}
                  {...register('password', { required: 'Enter your password.' })}
                />
              </Field>

              <Field
                label="Authenticator code"
                htmlFor="a-totp"
                hint="Only if two-factor is enabled on this account"
              >
                <Input
                  id="a-totp" inputMode="numeric" maxLength={6} placeholder="123456"
                  {...register('totp_code')}
                />
              </Field>

              <Button type="submit" className="w-full" loading={submitting}>
                Sign in
              </Button>
            </form>

            <p className="text-center text-sm text-muted">
              Not an admin?{' '}
              <Link to="/login" className="text-signal hover:underline">Vendor sign in</Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
