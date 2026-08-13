import { useState } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

/**
 * The vendor email/password form itself, shared by the standalone /login
 * page and the landing-page sign-in modal so the two never drift. The
 * caller decides what happens after a successful sign-in via `onSuccess`.
 */
export function VendorSignInForm({ onSuccess }) {
  const { login } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const principal = await login(values);
      onSuccess(principal);
    } catch (error) {
      // The server returns one message for unknown email and wrong password
      // alike, so we do not leak which accounts exist.
      toast.error(error.message ?? 'Could not sign you in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
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
        <Link to="/demo" className="text-signal hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}

VendorSignInForm.propTypes = {
  onSuccess: PropTypes.func.isRequired,
};
