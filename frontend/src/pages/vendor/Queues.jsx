import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react';

import { branches, providers as providersApi, queues, services } from '@/api/endpoints';
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
import { formatTime } from '@/lib/cn';

const OPERATOR_OVERRIDE_ROLES = new Set(['owner', 'manager']);

export default function Queues() {
  const { principal, can } = useAuth();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [startingQueue, setStartingQueue] = useState(null); // queue row being started
  const [endingQueue, setEndingQueue] = useState(null); // queue row pending "end queue" confirmation
  const [editingQueue, setEditingQueue] = useState(null); // queue row being edited
  const [deletingQueue, setDeletingQueue] = useState(null); // queue row pending delete confirmation
  const [shareResult, setShareResult] = useState(null); // { queue_name, doctor_name, code, expires_at, queue_id }
  const toast = useToast();
  const queryClient = useQueryClient();
  const canShareConsole = OPERATOR_OVERRIDE_ROLES.has(principal?.role);
  const canEdit = can('queues:update');
  const canDelete = can('queues:delete');

  const listQuery = useQuery({
    queryKey: ['queues', { page }],
    queryFn: () => queues.list({ page, page_size: 20 }),
  });

  const create = useMutation({
    mutationFn: (data) => queues.create(data),
    onSuccess: () => {
      toast.success('Queue created');
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const lifecycle = useMutation({
    mutationFn: ({ id, action, data }) => queues.lifecycle(id, action, data),
    onSuccess: (queue) => {
      toast.success(`Queue ${queue.status}`);
      setStartingQueue(null);
      setEndingQueue(null);
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const shareConsole = useMutation({
    mutationFn: (id) => queues.shareConsole(id),
    onSuccess: (data) => setShareResult(data),
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => queues.update(id, data),
    onSuccess: () => {
      toast.success('Queue updated');
      setEditingQueue(null);
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id) => queues.remove(id),
    onSuccess: () => {
      toast.success('Queue deleted');
      setDeletingQueue(null);
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Queues</h1>
          <p className="text-sm text-muted">One queue per service, per day.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New queue
        </Button>
      </div>

      <Card>
        <CardHeader title="All queues" icon={ListOrdered} />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && (
          <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />
        )}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={ListOrdered}
                  title="No queues yet"
                  description="Create one to start issuing tokens."
                  action={<Button onClick={() => setCreateOpen(true)}>New queue</Button>}
                />
              }
              columns={[
                { key: 'name', header: 'Queue' },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status} /> },
                {
                  key: 'business_day',
                  header: 'Day',
                  render: (r) => <span className="tabular text-muted">{r.business_day}</span>,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (row) => (
                    <div className="flex justify-end gap-2">
                      {row.status !== 'open' && (
                        <Button
                          variant="secondary" size="sm"
                          onClick={() =>
                            row.status === 'paused'
                              ? lifecycle.mutate({ id: row.id, action: 'resume' })
                              : setStartingQueue(row)
                          }
                        >
                          {row.status === 'paused' ? 'Resume' : 'Start'}
                        </Button>
                      )}
                      {canShareConsole && row.status !== 'draft' && (
                        <Button
                          variant="secondary" size="sm"
                          loading={shareConsole.isPending && shareConsole.variables === row.id}
                          onClick={() => shareConsole.mutate(row.id)}
                        >
                          Share console
                        </Button>
                      )}
                      {canShareConsole && (row.status === 'open' || row.status === 'paused') && (
                        <Button
                          variant="danger" size="sm"
                          onClick={() => setEndingQueue(row)}
                        >
                          End queue
                        </Button>
                      )}
                      <Link to={`/vendor/queues/${row.id}/console`}>
                        <Button size="sm">Console</Button>
                      </Link>
                      {canEdit && (
                        <Button
                          variant="secondary" size="sm"
                          onClick={() => setEditingQueue(row)}
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {canDelete && row.status !== 'open' && row.status !== 'paused' && (
                        <Button
                          variant="danger" size="sm"
                          onClick={() => setDeletingQueue(row)}
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

      <CreateQueueDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(data) => create.mutate(data)}
        loading={create.isPending}
      />

      <StartQueueDialog
        queue={startingQueue}
        onClose={() => setStartingQueue(null)}
        onSubmit={(providerId) =>
          lifecycle.mutate({
            id: startingQueue.id,
            action: 'start',
            data: { provider_id: providerId },
          })
        }
        loading={lifecycle.isPending}
      />

      <ShareConsoleDialog result={shareResult} onClose={() => setShareResult(null)} />

      <ConfirmDialog
        open={Boolean(endingQueue)}
        onClose={() => setEndingQueue(null)}
        onConfirm={() => lifecycle.mutate({ id: endingQueue.id, action: 'close' })}
        title={`End "${endingQueue?.name ?? ''}"?`}
        description="This stops it from accepting new tokens. Anyone still waiting or being served will be cancelled, and this cannot be undone."
        confirmLabel="End queue"
        variant="danger"
        loading={lifecycle.isPending}
      />

      <EditQueueDialog
        queue={editingQueue}
        onClose={() => setEditingQueue(null)}
        onSubmit={(data) => update.mutate({ id: editingQueue.id, data })}
        loading={update.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingQueue)}
        onClose={() => setDeletingQueue(null)}
        onConfirm={() => remove.mutate(deletingQueue.id)}
        title={`Delete "${deletingQueue?.name ?? ''}"?`}
        description="This permanently removes the queue from your dashboard. This cannot be undone."
        confirmLabel="Delete queue"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

function ShareConsoleDialog({ result, onClose }) {
  const toast = useToast();
  const [copied, setCopied] = useState(null); // 'code' | 'link' | null

  const link = result ? `${window.location.origin}/console-access/${result.queue_id}` : '';

  const copy = async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
    } catch {
      toast.error('Could not copy - select and copy manually.');
    }
  };

  return (
    <Dialog
      open={Boolean(result)}
      onClose={onClose}
      title={`Share "${result?.queue_name ?? ''}" console`}
      description={`Send both of these to ${result?.doctor_name ?? 'the doctor'} - the link alone can't open the console.`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {result && (
        <div className="space-y-4">
          <Field label="Link" htmlFor="share-link">
            <div className="flex gap-2">
              <Input id="share-link" readOnly value={link} className="font-mono text-xs" />
              <Button variant="secondary" size="sm" onClick={() => copy('link', link)}>
                {copied === 'link' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </Field>
          <Field label="One-time code" htmlFor="share-code" hint={`Expires ${formatTime(result.expires_at)}`}>
            <div className="flex gap-2">
              <Input
                id="share-code" readOnly value={result.code}
                className="text-center font-mono text-lg tracking-[0.3em]"
              />
              <Button variant="secondary" size="sm" onClick={() => copy('code', result.code)}>
                {copied === 'code' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </Field>
        </div>
      )}
    </Dialog>
  );
}

ShareConsoleDialog.propTypes = {
  result: PropTypes.shape({
    queue_id: PropTypes.string,
    queue_name: PropTypes.string,
    doctor_name: PropTypes.string,
    code: PropTypes.string,
    expires_at: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
};

function StartQueueDialog({ queue, onClose, onSubmit, loading }) {
  const [providerId, setProviderId] = useState('');
  const open = Boolean(queue);

  const providerQuery = useQuery({
    queryKey: ['providers', 'all'],
    queryFn: () => providersApi.list({ page_size: 100 }),
    enabled: open,
  });

  const close = () => {
    setProviderId('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Start "${queue?.name ?? ''}"`}
      description="Assign the doctor who will run this queue's Operator Console. Only they (or an owner/manager) will be able to open it."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={() => onSubmit(providerId)} loading={loading} disabled={!providerId}>
            Start queue
          </Button>
        </>
      }
    >
      <Field label="Doctor" htmlFor="q-start-provider" required>
        <Select
          id="q-start-provider" value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
        >
          <option value="">Choose a doctor</option>
          {(providerQuery.data?.data ?? []).map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </Select>
      </Field>
    </Dialog>
  );
}

StartQueueDialog.propTypes = {
  queue: PropTypes.shape({ id: PropTypes.string, name: PropTypes.string }),
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

function EditQueueDialog({ queue, onClose, onSubmit, loading }) {
  const open = Boolean(queue);
  const [form, setForm] = useState({ name: '', provider_id: '', max_tokens: '' });

  useEffect(() => {
    if (queue) {
      setForm({
        name: queue.name ?? '',
        provider_id: queue.provider_id ?? '',
        max_tokens: queue.max_tokens != null ? String(queue.max_tokens) : '',
      });
    }
  }, [queue]);

  const providerQuery = useQuery({
    queryKey: ['providers', 'all'],
    queryFn: () => providersApi.list({ page_size: 100 }),
    enabled: open,
  });

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const valid = form.name.trim().length >= 2;

  const submit = () => {
    onSubmit({
      name: form.name.trim(),
      provider_id: form.provider_id || undefined,
      max_tokens: form.max_tokens ? Number(form.max_tokens) : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit "${queue?.name ?? ''}"`}
      description="Update the queue's name, assigned doctor, or capacity."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!valid}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="q-edit-name" required>
          <Input id="q-edit-name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Doctor" htmlFor="q-edit-provider">
          <Select id="q-edit-provider" value={form.provider_id} onChange={set('provider_id')}>
            <option value="">Unassigned</option>
            {(providerQuery.data?.data ?? []).map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Max tokens" htmlFor="q-edit-max-tokens" hint="Leave blank to keep the current value.">
          <Input
            id="q-edit-max-tokens" type="number" min="1"
            value={form.max_tokens} onChange={set('max_tokens')}
          />
        </Field>
      </div>
    </Dialog>
  );
}

EditQueueDialog.propTypes = {
  queue: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    provider_id: PropTypes.string,
    max_tokens: PropTypes.number,
  }),
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

function CreateQueueDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ name: '', branch_id: '', service_id: '' });

  const branchQuery = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => branches.list({ page_size: 100 }),
    enabled: open,
  });
  const serviceQuery = useQuery({
    queryKey: ['services', 'all'],
    queryFn: () => services.list({ page_size: 100 }),
    enabled: open,
  });

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const valid = form.name.trim() && form.branch_id && form.service_id;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New queue"
      description="Tokens are numbered per service, per day."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} loading={loading} disabled={!valid}>
            Create queue
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="q-name" required>
          <Input
            id="q-name" value={form.name} onChange={set('name')}
            placeholder="Walk-in consultations"
          />
        </Field>
        <Field label="Branch" htmlFor="q-branch" required>
          <Select id="q-branch" value={form.branch_id} onChange={set('branch_id')}>
            <option value="">Choose a branch</option>
            {(branchQuery.data?.data ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Service" htmlFor="q-service" required>
          <Select id="q-service" value={form.service_id} onChange={set('service_id')}>
            <option value="">Choose a service</option>
            {(serviceQuery.data?.data ?? []).map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

CreateQueueDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  loading: PropTypes.bool,
};
