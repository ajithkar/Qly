import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';

import { branches, services } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

export default function Services() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deletingService, setDeletingService] = useState(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = can('services:update');
  const canDelete = can('services:delete');

  const listQuery = useQuery({
    queryKey: ['services', { page }],
    queryFn: () => services.list({ page, page_size: 20 }),
  });

  const create = useMutation({
    mutationFn: (data) => services.create(data),
    onSuccess: () => {
      toast.success('Service created');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (error) => {
      // Plan limits are enforced server-side; surface the upgrade path plainly.
      if (error.code === 'plan_limit_reached') {
        toast.error(`${error.message} Visit Billing to upgrade.`);
        return;
      }
      toast.error(error.message);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => services.update(id, data),
    onSuccess: () => {
      toast.success('Service updated');
      setEditingService(null);
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id) => services.remove(id),
    onSuccess: () => {
      toast.success('Service deleted');
      setDeletingService(null);
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Services</h1>
          <p className="text-sm text-muted">What customers can book or queue for.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New service
        </Button>
      </div>

      <Card>
        <CardHeader title="All services" icon={Package} />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={Package}
                  title="No services yet"
                  description="Add a service before creating a queue for it."
                  action={<Button onClick={() => setOpen(true)}>New service</Button>}
                />
              }
              columns={[
                { key: 'name', header: 'Service' },
                {
                  key: 'duration_minutes',
                  header: 'Duration',
                  render: (r) => <span className="tabular">{r.duration_minutes} min</span>,
                },
                {
                  key: 'price',
                  header: 'Price',
                  render: (r) => <span className="tabular">{r.price.toFixed(2)}</span>,
                },
                {
                  key: 'payment_mode',
                  header: 'Payment',
                  render: (r) => (
                    <span className="text-muted">
                      {r.payment_mode === 'prepaid_online' ? 'Online' : 'At venue'}
                    </span>
                  ),
                },
                {
                  key: 'token_prefix',
                  header: 'Prefix',
                  render: (r) => (
                    <span className="font-mono text-muted">{r.token_prefix || '—'}</span>
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
                          onClick={() => setEditingService(row)}
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="danger" size="sm"
                          onClick={() => setDeletingService(row)}
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

      <ServiceDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(data) => create.mutate(data)}
        loading={create.isPending}
      />

      <EditServiceDialog
        service={editingService}
        onClose={() => setEditingService(null)}
        onSubmit={(data) => update.mutate({ id: editingService.id, data })}
        loading={update.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingService)}
        onClose={() => setDeletingService(null)}
        onConfirm={() => remove.mutate(deletingService.id)}
        title={`Delete "${deletingService?.name ?? ''}"?`}
        description="This permanently removes the service from your dashboard. This cannot be undone."
        confirmLabel="Delete service"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

function ServiceDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', branch_id: '', description: '', duration_minutes: 15,
    buffer_minutes: 0, price: 0, payment_mode: 'pay_at_venue',
    queue_capacity: 100, token_prefix: '',
  });

  const branchQuery = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => branches.list({ page_size: 100 }),
    enabled: open,
  });

  const set = (key, asNumber = false) => (event) =>
    setForm({ ...form, [key]: asNumber ? Number(event.target.value) : event.target.value });

  const valid = form.name.trim() && form.branch_id && form.duration_minutes > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New service"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit({ ...form, token_prefix: form.token_prefix || null })}
            loading={loading}
            disabled={!valid}
          >
            Create service
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="s-name" required>
          <Input id="s-name" value={form.name} onChange={set('name')} placeholder="Consultation" />
        </Field>
        <Field label="Branch" htmlFor="s-branch" required>
          <Select id="s-branch" value={form.branch_id} onChange={set('branch_id')}>
            <option value="">Choose a branch</option>
            {(branchQuery.data?.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="s-desc">
          <Textarea id="s-desc" value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)" htmlFor="s-dur" required>
            <Input
              id="s-dur" type="number" min="1"
              value={form.duration_minutes} onChange={set('duration_minutes', true)}
            />
          </Field>
          <Field label="Buffer (min)" htmlFor="s-buf" hint="Gap between bookings">
            <Input
              id="s-buf" type="number" min="0"
              value={form.buffer_minutes} onChange={set('buffer_minutes', true)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price" htmlFor="s-price">
            <Input
              id="s-price" type="number" min="0" step="0.01"
              value={form.price} onChange={set('price', true)}
            />
          </Field>
          <Field label="Token prefix" htmlFor="s-prefix" hint="e.g. A gives A001">
            <Input id="s-prefix" maxLength={4} value={form.token_prefix} onChange={set('token_prefix')} />
          </Field>
        </div>
        <Field label="Payment" htmlFor="s-pay">
          <Select id="s-pay" value={form.payment_mode} onChange={set('payment_mode')}>
            <option value="pay_at_venue">Pay at venue</option>
            <option value="prepaid_online">Pay online when booking</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function EditServiceDialog({ service, onClose, onSubmit, loading }) {
  const open = Boolean(service);
  const [form, setForm] = useState({
    name: '', description: '', duration_minutes: 15,
    buffer_minutes: 0, price: 0, payment_mode: 'pay_at_venue',
    queue_capacity: 100, token_prefix: '',
  });

  useEffect(() => {
    if (service) {
      setForm({
        name: service.name ?? '',
        description: service.description ?? '',
        duration_minutes: service.duration_minutes ?? 15,
        buffer_minutes: service.buffer_minutes ?? 0,
        price: service.price ?? 0,
        payment_mode: service.payment_mode ?? 'pay_at_venue',
        queue_capacity: service.queue_capacity ?? 100,
        token_prefix: service.token_prefix ?? '',
      });
    }
  }, [service]);

  const set = (key, asNumber = false) => (event) =>
    setForm({ ...form, [key]: asNumber ? Number(event.target.value) : event.target.value });

  const valid = form.name.trim() && form.duration_minutes > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit "${service?.name ?? ''}"`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit({ ...form, token_prefix: form.token_prefix || null })}
            loading={loading}
            disabled={!valid}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="s-edit-name" required>
          <Input id="s-edit-name" value={form.name} onChange={set('name')} placeholder="Consultation" />
        </Field>
        <Field label="Description" htmlFor="s-edit-desc">
          <Textarea id="s-edit-desc" value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)" htmlFor="s-edit-dur" required>
            <Input
              id="s-edit-dur" type="number" min="1"
              value={form.duration_minutes} onChange={set('duration_minutes', true)}
            />
          </Field>
          <Field label="Buffer (min)" htmlFor="s-edit-buf" hint="Gap between bookings">
            <Input
              id="s-edit-buf" type="number" min="0"
              value={form.buffer_minutes} onChange={set('buffer_minutes', true)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price" htmlFor="s-edit-price">
            <Input
              id="s-edit-price" type="number" min="0" step="0.01"
              value={form.price} onChange={set('price', true)}
            />
          </Field>
          <Field label="Token prefix" htmlFor="s-edit-prefix" hint="e.g. A gives A001">
            <Input id="s-edit-prefix" maxLength={4} value={form.token_prefix} onChange={set('token_prefix')} />
          </Field>
        </div>
        <Field label="Payment" htmlFor="s-edit-pay">
          <Select id="s-edit-pay" value={form.payment_mode} onChange={set('payment_mode')}>
            <option value="pay_at_venue">Pay at venue</option>
            <option value="prepaid_online">Pay online when booking</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

EditServiceDialog.propTypes = {
  service: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    duration_minutes: PropTypes.number,
    buffer_minutes: PropTypes.number,
    price: PropTypes.number,
    payment_mode: PropTypes.string,
    queue_capacity: PropTypes.number,
    token_prefix: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

ServiceDialog.propTypes = {
  open: PropTypes.bool, onClose: PropTypes.func,
  onSubmit: PropTypes.func, loading: PropTypes.bool,
};
