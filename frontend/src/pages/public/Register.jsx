import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

// Bumping this pair of constants is how a re-acceptance of the current terms
// would be forced on the next registration; there is no public terms/privacy
// page yet, so this is a version marker rather than a link target.
const TERMS_VERSION = '2026-01';
const PRIVACY_VERSION = '2026-01';

const PLANS = [
  { code: 'free', label: 'Free — 1 branch, 200 tokens/mo' },
  { code: 'starter', label: 'Starter — $29/mo' },
  { code: 'business', label: 'Business — $99/mo' },
  { code: 'enterprise', label: 'Enterprise — talk to us' },
];

export default function Register() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(null);
  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm({ defaultValues: { plan_code: 'free' } });

  if (!loading && isAuthenticated) {
    return <Navigate to="/vendor" replace />;
  }

  const password = watch('password');

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const result = await auth.registerVendor({
        company_name: values.company_name,
        owner_name: values.owner_name,
        email: values.email,
        password: values.password,
        plan_code: values.plan_code,
        accepted_terms_version: TERMS_VERSION,
        accepted_privacy_version: PRIVACY_VERSION,
      });
      setRegistered(result);
    } catch (error) {
      toast.error(error.message ?? 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-mono text-sm font-bold">
          <img src={logoMark} alt="" className="h-7 w-7" aria-hidden="true" />
          Qly
        </Link>
        <Card>
          <CardBody className="space-y-5">
            {registered ? (
              <div className="space-y-4 text-center">
                <h1 className="text-base font-semibold tracking-tight">Almost there</h1>
                <p className="text-sm text-muted">{registered.message}</p>
                <Button className="w-full" onClick={() => navigate('/login')}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">List your business</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    Set up your queue in a couple of minutes.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field label="Business name" htmlFor="r-company" error={errors.company_name?.message} required>
                    <Input
                      id="r-company" autoComplete="organization"
                      invalid={Boolean(errors.company_name)}
                      {...register('company_name', {
                        required: 'Enter your business name.',
                        minLength: { value: 2, message: 'At least 2 characters.' },
                      })}
                    />
                  </Field>

                  <Field label="Your name" htmlFor="r-owner" error={errors.owner_name?.message} required>
                    <Input
                      id="r-owner" autoComplete="name"
                      invalid={Boolean(errors.owner_name)}
                      {...register('owner_name', {
                        required: 'Enter your name.',
                        minLength: { value: 2, message: 'At least 2 characters.' },
                      })}
                    />
                  </Field>

                  <Field label="Email" htmlFor="r-email" error={errors.email?.message} required>
                    <Input
                      id="r-email" type="email" autoComplete="email"
                      invalid={Boolean(errors.email)}
                      {...register('email', { required: 'Enter your email address.' })}
                    />
                  </Field>

                  <Field
                    label="Password" htmlFor="r-password" error={errors.password?.message} required
                    hint="At least 10 characters, with an uppercase letter, a lowercase letter and a digit."
                  >
                    <Input
                      id="r-password" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.password)}
                      {...register('password', {
                        required: 'Choose a password.',
                        minLength: { value: 10, message: 'At least 10 characters.' },
                      })}
                    />
                  </Field>

                  <Field
                    label="Confirm password" htmlFor="r-password-confirm"
                    error={errors.password_confirm?.message} required
                  >
                    <Input
                      id="r-password-confirm" type="password" autoComplete="new-password"
                      invalid={Boolean(errors.password_confirm)}
                      {...register('password_confirm', {
                        required: 'Confirm your password.',
                        validate: (value) => value === password || 'Passwords do not match.',
                      })}
                    />
                  </Field>

                  <Field label="Plan" htmlFor="r-plan" required>
                    <Select id="r-plan" {...register('plan_code', { required: true })}>
                      {PLANS.map((plan) => (
                        <option key={plan.code} value={plan.code}>{plan.label}</option>
                      ))}
                    </Select>
                  </Field>

                  <label className="flex items-start gap-2 text-xs text-muted">
                    <input
                      type="checkbox" className="mt-0.5"
                      {...register('agreed', { required: true })}
                    />
                    I agree to the Terms of Service and Privacy Policy.
                  </label>
                  {errors.agreed && (
                    <p role="alert" className="text-xs text-rose">
                      You must agree before creating an account.
                    </p>
                  )}

                  <Button type="submit" className="w-full" loading={submitting}>
                    Create account
                  </Button>
                </form>

                <p className="text-center text-sm text-muted">
                  Already have an account?{' '}
                  <Link to="/login" className="text-signal hover:underline">Sign in</Link>
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
