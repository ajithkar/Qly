import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';

import { branches, providers } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

/**
 * "Team" in the UI, "providers" in the API — Qly is industry-agnostic, so the
 * label has to work for a clinic, a salon and a bank counter alike.
 */
export default function Providers() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [deletingProvider, setDeletingProvider] = useState(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = can('providers:update');
  const canDelete = can('providers:delete');

  const listQuery = useQuery({
    queryKey: ['providers', { page }],
    queryFn: () => providers.list({ page, page_size: 20 }),
  });

  const create = useMutation({
    mutationFn: (data) => providers.create(data),
    onSuccess: () => {
      toast.success('Team member added');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => providers.update(id, data),
    onSuccess: () => {
      toast.success('Team member updated');
      setEditingProvider(null);
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id) => providers.remove(id),
    onSuccess: () => {
      toast.success('Team member deleted');
      setDeletingProvider(null);
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted">People who serve customers.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add someone
        </Button>
      </div>

      <Card>
        <CardHeader title="All team members" icon={Users} />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={Users}
                  title="Nobody added yet"
                  description="Add a team member so customers can pick who they see."
                  action={<Button onClick={() => setOpen(true)}>Add someone</Button>}
                />
              }
              columns={[
                { key: 'name', header: 'Name' },
                {
                  key: 'specialty',
                  header: 'Specialty',
                  render: (r) => r.specialty || <span className="text-muted">—</span>,
                },
                {
                  key: 'consultation_fee',
                  header: 'Fee',
                  render: (r) => <span className="tabular">{r.consultation_fee.toFixed(2)}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => (
                    <Badge tone={r.status === 'active' ? 'open' : 'closed'}>{r.status}</Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (row) => (
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="secondary" size="sm"
                          onClick={() => setEditingProvider(row)}
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="danger" size="sm"
                          onClick={() => setDeletingProvider(row)}
                          aria-label={`Delete ${row.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ProviderDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(data) => create.mutate(data)}
        loading={create.isPending}
      />

      <EditProviderDialog
        provider={editingProvider}
        onClose={() => setEditingProvider(null)}
        onSubmit={(data) => update.mutate({ id: editingProvider.id, data })}
        loading={update.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingProvider)}
        onClose={() => setDeletingProvider(null)}
        onConfirm={() => remove.mutate(deletingProvider.id)}
        title={`Delete "${deletingProvider?.name ?? ''}"?`}
        description="This permanently removes them from your dashboard. This cannot be undone."
        confirmLabel="Delete team member"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ProviderDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', branch_id: '', title: '', specialty: '',
    consultation_fee: 0, opens_at: '09:00', closes_at: '17:00',
  });
  const [days, setDays] = useState([0, 1, 2, 3, 4]);

  const branchQuery = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => branches.list({ page_size: 100 }),
    enabled: open,
  });

  const set = (key, asNumber = false) => (event) =>
    setForm({ ...form, [key]: asNumber ? Number(event.target.value) : event.target.value });

  const toggleDay = (index) =>
    setDays((current) =>
      current.includes(index) ? current.filter((d) => d !== index) : [...current, index],
    );

  const submit = () =>
    onSubmit({
      name: form.name,
      branch_id: form.branch_id,
      title: form.title || null,
      specialty: form.specialty || null,
      consultation_fee: form.consultation_fee,
      working_hours: days.map((weekday) => ({
        weekday,
        opens_at: `${form.opens_at}:00`,
        closes_at: `${form.closes_at}:00`,
        is_closed: false,
      })),
      leaves: [],
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a team member"
      description="Working hours decide which appointment slots exist."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit} loading={loading}
            disabled={!form.name.trim() || !form.branch_id || !days.length}
          >
            Add to team
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="p-name" required>
          <Input id="p-name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Branch" htmlFor="p-branch" required>
          <Select id="p-branch" value={form.branch_id} onChange={set('branch_id')}>
            <option value="">Choose a branch</option>
            {(branchQuery.data?.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" htmlFor="p-title">
            <Input id="p-title" value={form.title} onChange={set('title')} placeholder="Dr." />
          </Field>
          <Field label="Specialty" htmlFor="p-spec">
            <Input id="p-spec" value={form.specialty} onChange={set('specialty')} />
          </Field>
        </div>
        <Field label="Fee" htmlFor="p-fee">
          <Input
            id="p-fee" type="number" min="0" step="0.01"
            value={form.consultation_fee} onChange={set('consultation_fee', true)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts at" htmlFor="p-open">
            <Input id="p-open" type="time" value={form.opens_at} onChange={set('opens_at')} />
          </Field>
          <Field label="Ends at" htmlFor="p-close">
            <Input id="p-close" type="time" value={form.closes_at} onChange={set('closes_at')} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Working days</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(index)}
                aria-pressed={days.includes(index)}
                className={
                  days.includes(index)
                    ? 'rounded-card border border-signal bg-signal/10 px-3 py-1.5 text-sm font-medium text-signal'
                    : 'rounded-card border border-line px-3 py-1.5 text-sm text-muted hover:text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function EditProviderDialog({ provider, onClose, onSubmit, loading }) {
  const open = Boolean(provider);
  const [form, setForm] = useState({
    name: '', title: '', specialty: '', consultation_fee: 0, status: 'active',
  });

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name ?? '',
        title: provider.title ?? '',
        specialty: provider.specialty ?? '',
        consultation_fee: provider.consultation_fee ?? 0,
        status: provider.status ?? 'active',
      });
    }
  }, [provider]);

  const set = (key, asNumber = false) => (event) =>
    setForm({ ...form, [key]: asNumber ? Number(event.target.value) : event.target.value });

  const submit = () =>
    onSubmit({
      name: form.name,
      title: form.title || null,
      specialty: form.specialty || null,
      consultation_fee: form.consultation_fee,
      status: form.status,
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit "${provider?.name ?? ''}"`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!form.name.trim()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="p-edit-name" required>
          <Input id="p-edit-name" value={form.name} onChange={set('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" htmlFor="p-edit-title">
            <Input id="p-edit-title" value={form.title} onChange={set('title')} placeholder="Dr." />
          </Field>
          <Field label="Specialty" htmlFor="p-edit-spec">
            <Input id="p-edit-spec" value={form.specialty} onChange={set('specialty')} />
          </Field>
        </div>
        <Field label="Fee" htmlFor="p-edit-fee">
          <Input
            id="p-edit-fee" type="number" min="0" step="0.01"
            value={form.consultation_fee} onChange={set('consultation_fee', true)}
          />
        </Field>
        <Field label="Status" htmlFor="p-edit-status">
          <Select id="p-edit-status" value={form.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

EditProviderDialog.propTypes = {
  provider: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    title: PropTypes.string,
    specialty: PropTypes.string,
    consultation_fee: PropTypes.number,
    status: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

ProviderDialog.propTypes = {
  open: PropTypes.bool, onClose: PropTypes.func,
  onSubmit: PropTypes.func, loading: PropTypes.bool,
};
