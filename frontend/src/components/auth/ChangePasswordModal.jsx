import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { auth } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

/**
 * Blocking gate shown right after a first login with a temp password
 * (principal.must_change_password). `onClose` is intentionally a no-op so
 * the Escape key, backdrop click and header close button can't dismiss it -
 * the only way out is a successful password change.
 */
export function ChangePasswordModal() {
  const { principal, reload } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  const change = useMutation({
    mutationFn: () =>
      auth.changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      }),
    onSuccess: async () => {
      toast.success('Password changed');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      await reload();
    },
    onError: (error) => {
      toast.error(
        error.details?.length ? error.details.map((d) => d.message).join(' ') : error.message,
      );
    },
  });

  if (!principal?.must_change_password) return null;

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const passwordsMatch = form.new_password && form.new_password === form.confirm_password;
  const meetsPolicy =
    form.new_password.length >= 10 &&
    /[a-z]/.test(form.new_password) &&
    /[A-Z]/.test(form.new_password) &&
    /\d/.test(form.new_password);
  const valid = form.current_password && meetsPolicy && passwordsMatch;

  return (
    <Dialog
      open
      onClose={() => {}}
      title="Set a new password"
      description="You signed in with a temporary password. Choose a new one to continue."
      footer={
        <Button onClick={() => change.mutate()} loading={change.isPending} disabled={!valid}>
          Change password
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Current (temporary) password" htmlFor="cp-current" required>
          <Input
            id="cp-current" type="password" autoComplete="current-password"
            value={form.current_password} onChange={set('current_password')}
          />
        </Field>
        <Field label="New password" htmlFor="cp-new" required hint="At least 10 characters, with an uppercase letter, a lowercase letter and a digit.">
          <Input
            id="cp-new" type="password" autoComplete="new-password"
            value={form.new_password} onChange={set('new_password')}
          />
        </Field>
        <Field
          label="Confirm new password" htmlFor="cp-confirm" required
          error={form.confirm_password && !passwordsMatch ? 'Passwords do not match.' : undefined}
        >
          <Input
            id="cp-confirm" type="password" autoComplete="new-password"
            value={form.confirm_password} onChange={set('confirm_password')}
          />
        </Field>
      </div>
    </Dialog>
  );
}
