import { useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';

import { branches } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

export default function Branches() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['branches', { page }],
    queryFn: () => branches.list({ page, page_size: 20 }),
  });

  const create = useMutation({
    mutationFn: (data) => branches.create(data),
    onSuccess: () => {
      toast.success('Branch created');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error) => {
      if (error.code === 'plan_limit_reached') {
        toast.error(`${error.message} Visit Billing to upgrade.`);
        return;
      }
      toast.error(error.message);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Branches</h1>
          <p className="text-sm text-muted">
            Queues, team and services all belong to a branch.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New branch
        </Button>
      </div>

      <Card>
        <CardHeader title="All branches" />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={Building2}
                  title="No branches yet"
                  description="Start with one branch — you can add more on a higher plan."
                  action={<Button onClick={() => setOpen(true)}>New branch</Button>}
                />
              }
              columns={[
                { key: 'name', header: 'Branch' },
                { key: 'timezone', header: 'Timezone', render: (r) => (
                  <span className="text-muted">{r.timezone}</span>
                ) },
                { key: 'phone', header: 'Phone', render: (r) => r.phone || (
                  <span className="text-muted">—</span>
                ) },
              ]}
            />
            <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <BranchDialog
        open={open} onClose={() => setOpen(false)}
        onSubmit={(data) => create.mutate(data)} loading={create.isPending}
      />
    </div>
  );
}

function BranchDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', phone: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  return (
    <Dialog
      open={open} onClose={onClose} title="New branch"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit({ ...form, phone: form.phone || null })}
            loading={loading} disabled={!form.name.trim()}
          >
            Create branch
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="b-name" required>
          <Input id="b-name" value={form.name} onChange={set('name')} placeholder="Main branch" />
        </Field>
        <Field
          label="Timezone" htmlFor="b-tz"
          hint="Token numbering and today's figures follow this."
        >
          <Input id="b-tz" value={form.timezone} onChange={set('timezone')} />
        </Field>
        <Field label="Phone" htmlFor="b-phone">
          <Input id="b-phone" value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
    </Dialog>
  );
}

BranchDialog.propTypes = {
  open: PropTypes.bool, onClose: PropTypes.func,
  onSubmit: PropTypes.func, loading: PropTypes.bool,
};
