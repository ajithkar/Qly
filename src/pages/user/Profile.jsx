import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, CalendarDays, Download, LogOut, ShieldOff, User as UserIcon,
} from 'lucide-react';

import { appointments, me } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonRows, Spinner } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatTime } from '@/lib/cn';

const APPOINTMENT_TONE = {
  booked: 'waiting', confirmed: 'called', checked_in: 'serving',
  completed: 'completed', cancelled: 'cancelled',
  no_show: 'no_show', rejected: 'skipped',
};

export default function Profile() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const profileQuery = useQuery({ queryKey: ['me', 'profile'], queryFn: me.profile });

  const signOut = async () => {
    await logout();
    navigate('/find');
  };

  if (profileQuery.isLoading) return <SkeletonRows rows={6} columns={1} />;
  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState error={profileQuery.error} onRetry={profileQuery.refetch} />
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <BackLink to="/find" label="Find a place" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar profile={profile} />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{profile.name ?? 'Your account'}</h1>
            <p className="text-sm text-muted">{profile.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>

      <ProfileForm profile={profile} />
      <PreferencesCard />
      <AppointmentsCard />
      <NotificationsCard />
      <PrivacyCard />
    </div>
  );
}

function Avatar({ profile }) {
  if (profile.picture) {
    return (
      <img
        src={profile.picture} alt="" referrerPolicy="no-referrer"
        className="h-11 w-11 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-paper">
      <UserIcon className="h-5 w-5 text-muted" aria-hidden="true" />
    </div>
  );
}

Avatar.propTypes = { profile: PropTypes.shape({ picture: PropTypes.string }).isRequired };

function ProfileForm({ profile }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: profile.name ?? '', date_of_birth: profile.date_of_birth ?? '',
  });

  const update = useMutation({
    mutationFn: (data) => me.updateProfile(data),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const dirty = form.name !== (profile.name ?? '') || form.date_of_birth !== (profile.date_of_birth ?? '');

  return (
    <Card>
      <CardHeader title="Your details" description={`Member since ${formatDate(profile.created_at)}`} />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="pf-name">
            <Input
              id="pf-name" value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </Field>
          <Field label="Date of birth" htmlFor="pf-dob">
            <Input
              id="pf-dob" type="date" value={form.date_of_birth ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
            />
          </Field>
        </div>
        <Button
          size="sm" disabled={!dirty} loading={update.isPending}
          onClick={() => update.mutate({ name: form.name || undefined, date_of_birth: form.date_of_birth || undefined })}
        >
          Save changes
        </Button>
      </CardBody>
    </Card>
  );
}

ProfileForm.propTypes = {
  profile: PropTypes.shape({
    name: PropTypes.string,
    date_of_birth: PropTypes.string,
    created_at: PropTypes.string,
  }).isRequired,
};

function PreferencesCard() {
  const toast = useToast();
  const prefsQuery = useQuery({ queryKey: ['me', 'preferences'], queryFn: me.preferences });
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (prefsQuery.data) setForm(prefsQuery.data);
  }, [prefsQuery.data]);

  const update = useMutation({
    mutationFn: (data) => me.updatePreferences(data),
    onSuccess: () => toast.success('Preferences saved'),
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader title="Notifications" description="How we reach you about your place in line." />
      <CardBody>
        {prefsQuery.isLoading && <Spinner />}
        {prefsQuery.isError && <ErrorState error={prefsQuery.error} onRetry={prefsQuery.refetch} />}
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="pref-email">
                <Select
                  id="pref-email"
                  value={form.email_enabled ? '1' : '0'}
                  onChange={(e) => setForm((prev) => ({ ...prev, email_enabled: e.target.value === '1' }))}
                >
                  <option value="1">On</option>
                  <option value="0">Off</option>
                </Select>
              </Field>
              <Field label="SMS" htmlFor="pref-sms">
                <Select
                  id="pref-sms"
                  value={form.sms_enabled ? '1' : '0'}
                  onChange={(e) => setForm((prev) => ({ ...prev, sms_enabled: e.target.value === '1' }))}
                >
                  <option value="1">On</option>
                  <option value="0">Off</option>
                </Select>
              </Field>
            </div>
            <Button
              size="sm" loading={update.isPending}
              onClick={() => update.mutate({ email_enabled: form.email_enabled, sms_enabled: form.sms_enabled })}
            >
              Save preferences
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function AppointmentsCard() {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['me', 'appointments', page],
    queryFn: () => appointments.mine({ page, page_size: 10 }),
  });

  const cancel = useMutation({
    mutationFn: (id) => appointments.cancelMine(id),
    onSuccess: () => {
      toast.success('Appointment cancelled');
      queryClient.invalidateQueries({ queryKey: ['me', 'appointments'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader title="Your appointments" />
      {listQuery.isLoading && <SkeletonRows />}
      {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
      {listQuery.isSuccess && (
        <>
          <Table
            rows={listQuery.data.data}
            empty={
              <EmptyState
                icon={CalendarDays}
                title="No appointments yet"
                description="Bookings you make will show up here."
                action={<Link to="/find"><Button size="sm">Find a place</Button></Link>}
              />
            }
            columns={[
              {
                key: 'slot_start',
                header: 'When',
                render: (r) => <span className="tabular">{formatDate(r.slot_start)} · {formatTime(r.slot_start)}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge tone={APPOINTMENT_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>,
              },
              { key: 'payment_status', header: 'Payment', render: (r) => <span className="text-muted">{r.payment_status}</span> },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) =>
                  ['booked', 'confirmed'].includes(r.status) ? (
                    <Button
                      variant="danger" size="sm"
                      loading={cancel.isPending && cancel.variables === r.id}
                      onClick={() => cancel.mutate(r.id)}
                    >
                      Cancel
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

function NotificationsCard() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['me', 'notifications', page],
    queryFn: () => me.notifications({ page, page_size: 10 }),
  });

  const markRead = useMutation({
    mutationFn: (id) => me.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] }),
  });

  return (
    <Card>
      <CardHeader title="Notifications" />
      {listQuery.isLoading && <SkeletonRows rows={3} columns={1} />}
      {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
      {listQuery.isSuccess && (
        <>
          {listQuery.data.data.length === 0 ? (
            <EmptyState icon={Bell} title="Nothing yet" description="Updates about your queues and bookings land here." />
          ) : (
            <ul className="divide-y divide-line/70">
              {listQuery.data.data.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line' : 'bg-signal'}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-sm text-muted">{n.body}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDate(n.created_at)} · {formatTime(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>
                      Mark read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

function PrivacyCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportData = useMutation({
    mutationFn: () => me.exportData(),
    onSuccess: (data) => {
      const blob = new window.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'qly-my-data.json';
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Your data was downloaded');
    },
    onError: (error) => toast.error(error.message),
  });

  const requestDeletion = useMutation({
    mutationFn: () => me.requestDeletion(),
    onSuccess: async (result) => {
      toast.success(result.message);
      await logout();
      navigate('/find');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader title="Privacy & data" description="Your data, on your terms." />
      <CardBody className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" loading={exportData.isPending} onClick={() => exportData.mutate()}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download my data
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
          <ShieldOff className="h-4 w-4" aria-hidden="true" />
          Delete my account
        </Button>
      </CardBody>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); requestDeletion.mutate(); }}
        title="Delete your account?"
        description="This deactivates your account and anonymises your profile. It cannot be undone from here."
        confirmLabel="Delete account"
        variant="danger"
        loading={requestDeletion.isPending}
      />
    </Card>
  );
}
