import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListOrdered, Plus } from 'lucide-react';

import { branches, queues, services } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

export default function Queues() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

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
    mutationFn: ({ id, action }) => queues.lifecycle(id, action),
    onSuccess: (queue) => {
      toast.success(`Queue ${queue.status}`);
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
        <CardHeader title="All queues" />
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
                            lifecycle.mutate({
                              id: row.id,
                              action: row.status === 'paused' ? 'resume' : 'start',
                            })
                          }
                        >
                          {row.status === 'paused' ? 'Resume' : 'Start'}
                        </Button>
                      )}
                      <Link to={`/vendor/queues/${row.id}/console`}>
                        <Button size="sm">Console</Button>
                      </Link>
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
    </div>
  );
}

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
