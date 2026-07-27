import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { auth } from '@/api/endpoints';
import logoMark from '@/assets/logo-mark.png';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function ForgotPassword() {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      // The API always reports success here, whether or not the address is
      // registered — it never confirms which accounts exist.
      await auth.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      toast.error(error.message ?? 'Could not send that right now.');
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
            {sent ? (
              <div className="space-y-4 text-center">
                <h1 className="text-base font-semibold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted">
                  If that address is registered, a reset link is on its way.
                </p>
                <Link to="/login">
                  <Button variant="secondary" className="w-full">Back to sign in</Button>
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">Reset your password</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    We&rsquo;ll email you a link to choose a new one.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field label="Email" htmlFor="fp-email" error={errors.email?.message} required>
                    <Input
                      id="fp-email" type="email" autoComplete="email"
                      invalid={Boolean(errors.email)}
                      {...register('email', { required: 'Enter your email address.' })}
                    />
                  </Field>

                  <Button type="submit" className="w-full" loading={submitting}>
                    Send reset link
                  </Button>
                </form>

                <p className="text-center text-sm text-muted">
                  <Link to="/login" className="text-signal hover:underline">Back to sign in</Link>
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
