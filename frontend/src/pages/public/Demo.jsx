import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CheckCircle2 } from 'lucide-react';

import { leads } from '@/api/endpoints';
import { trackEvent } from '@/lib/analytics';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, FileInput, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

const COPY = {
  clinic: {
    heading: 'Start your free trial',
    body: 'Tell us about your clinic and we’ll set you up within one business day.',
    submitLabel: 'Request my trial',
  },
  hospital: {
    heading: 'Book a demo',
    body: 'Tell us about your hospital and we’ll set up a walkthrough for your team.',
    submitLabel: 'Request a demo',
  },
};

const COUNT_OPTIONS = ['1', '2–5', '6–15', '16+'];
const PLAN_OPTIONS = [
  { code: 'free', label: '1-Month Trial' },
  { code: 'starter', label: 'Starter' },
  { code: 'business', label: 'Business' },
  { code: 'enterprise', label: 'Enterprise' },
];
const CERTIFICATE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg'];
const CERTIFICATE_MAX_MB = 5;

export default function Demo() {
  const [searchParams] = useSearchParams();
  const segment = searchParams.get('segment') === 'clinic' ? 'clinic' : 'hospital';
  const copy = COPY[segment];
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('organisation', values.organisation);
      formData.append('segment', segment);
      formData.append('phone', values.phone);
      formData.append('email', values.email);
      formData.append('department_count', values.department_count ?? '');
      formData.append('branch_count', values.branch_count ?? '');
      formData.append('plan_interest', values.plan_interest ?? '');
      formData.append('registration_certificate', values.registration_certificate[0]);

      const result = await leads.create(formData);
      trackEvent('lead_submitted', { segment });
      setDone(result.message);
    } catch (error) {
      toast.error(error.message ?? 'Could not send that just now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md">
        <BackLink to="/" label="Back to home" className="mb-4" />
        <Card>
          <CardBody className="space-y-5">
            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-jade" aria-hidden="true" />
                <h1 className="mt-3 text-base font-semibold tracking-tight">You’re on the list</h1>
                <p className="mt-1.5 text-sm text-muted">{done}</p>
                <Link to="/" className="mt-5 text-sm text-signal hover:underline">
                  Back to home
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-base font-semibold tracking-tight">{copy.heading}</h1>
                  <p className="mt-0.5 text-sm text-muted">{copy.body}</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <Field label="Your name" htmlFor="name" error={errors.name?.message} required>
                    <Input
                      id="name" invalid={Boolean(errors.name)}
                      {...register('name', { required: 'Tell us who you are.', minLength: { value: 2, message: 'Too short.' } })}
                    />
                  </Field>

                  <Field label="Organisation" htmlFor="organisation" error={errors.organisation?.message} required>
                    <Input
                      id="organisation" invalid={Boolean(errors.organisation)}
                      {...register('organisation', { required: 'Which clinic or hospital?', minLength: { value: 2, message: 'Too short.' } })}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Departments" htmlFor="department_count" hint="If it applies">
                      <Select id="department_count" {...register('department_count')} defaultValue="">
                        <option value="">Not sure yet</option>
                        {COUNT_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Branches" htmlFor="branch_count" hint="If it applies">
                      <Select id="branch_count" {...register('branch_count')} defaultValue="">
                        <option value="">Not sure yet</option>
                        {COUNT_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Subscription plan" htmlFor="plan_interest" hint="You can change this later">
                    <Select id="plan_interest" {...register('plan_interest')} defaultValue="">
                      <option value="">Not sure yet</option>
                      {PLAN_OPTIONS.map((plan) => (
                        <option key={plan.code} value={plan.code}>{plan.label}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Phone" htmlFor="phone" error={errors.phone?.message} required>
                    <Input
                      id="phone" type="tel" invalid={Boolean(errors.phone)}
                      {...register('phone', {
                        required: 'A number we can reach you on.',
                        minLength: { value: 6, message: 'Too short.' },
                      })}
                    />
                  </Field>

                  <Field label="Email" htmlFor="email" error={errors.email?.message} required>
                    <Input
                      id="email" type="email" invalid={Boolean(errors.email)}
                      {...register('email', {
                        required: 'We’ll send confirmation here.',
                        pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email.' },
                      })}
                    />
                  </Field>

                  <Field
                    label="Business registration certificate"
                    htmlFor="registration_certificate"
                    error={errors.registration_certificate?.message}
                    hint="PDF or JPG, up to 5MB"
                    required
                  >
                    <FileInput
                      id="registration_certificate"
                      accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                      invalid={Boolean(errors.registration_certificate)}
                      {...register('registration_certificate', {
                        required: 'Upload your business registration certificate.',
                        validate: (fileList) => {
                          const file = fileList?.[0];
                          if (!file) return 'Upload your business registration certificate.';
                          if (!CERTIFICATE_TYPES.includes(file.type)) {
                            return 'Only PDF or JPG files are accepted.';
                          }
                          if (file.size > CERTIFICATE_MAX_MB * 1024 * 1024) {
                            return `File must be under ${CERTIFICATE_MAX_MB}MB.`;
                          }
                          return true;
                        },
                      })}
                    />
                  </Field>

                  <Button type="submit" className="min-h-11 w-full" loading={submitting}>
                    {copy.submitLabel}
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
