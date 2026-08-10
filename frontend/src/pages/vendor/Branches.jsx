import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';

import { branches } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

export default function Branches() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [deletingBranch, setDeletingBranch] = useState(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = can('branches:update');
  const canDelete = can('branches:delete');

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

  const update = useMutation({
    mutationFn: ({ id, data }) => branches.update(id, data),
    onSuccess: () => {
      toast.success('Branch updated');
      setEditingBranch(null);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id) => branches.remove(id),
    onSuccess: () => {
      toast.success('Branch deleted');
      setDeletingBranch(null);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error) => toast.error(error.message),
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
        <CardHeader title="All branches" icon={Building2} />
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
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (row) => (
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="secondary" size="sm"
                          onClick={() => setEditingBranch(row)}
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="danger" size="sm"
                          onClick={() => setDeletingBranch(row)}
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

      <BranchDialog
        open={open} onClose={() => setOpen(false)}
        onSubmit={(data) => create.mutate(data)} loading={create.isPending}
      />

      <EditBranchDialog
        branch={editingBranch}
        onClose={() => setEditingBranch(null)}
        onSubmit={(data) => update.mutate({ id: editingBranch.id, data })}
        loading={update.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingBranch)}
        onClose={() => setDeletingBranch(null)}
        onConfirm={() => remove.mutate(deletingBranch.id)}
        title={`Delete "${deletingBranch?.name ?? ''}"?`}
        description="This permanently removes the branch and cannot be undone. Queues, team and services tied to it may be affected."
        confirmLabel="Delete branch"
        variant="danger"
        loading={remove.isPending}
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

function EditBranchDialog({ branch, onClose, onSubmit, loading }) {
  const open = Boolean(branch);
  const [form, setForm] = useState({ name: '', phone: '', timezone: '' });

  useEffect(() => {
    if (branch) {
      setForm({
        name: branch.name ?? '',
        phone: branch.phone ?? '',
        timezone: branch.timezone ?? '',
      });
    }
  }, [branch]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  return (
    <Dialog
      open={open} onClose={onClose} title={`Edit "${branch?.name ?? ''}"`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit({ ...form, phone: form.phone || null })}
            loading={loading} disabled={!form.name.trim()}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="b-edit-name" required>
          <Input id="b-edit-name" value={form.name} onChange={set('name')} placeholder="Main branch" />
        </Field>
        <Field
          label="Timezone" htmlFor="b-edit-tz"
          hint="Token numbering and today's figures follow this."
        >
          <Input id="b-edit-tz" value={form.timezone} onChange={set('timezone')} />
        </Field>
        <Field label="Phone" htmlFor="b-edit-phone">
          <Input id="b-edit-phone" value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
    </Dialog>
  );
}

EditBranchDialog.propTypes = {
  branch: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    phone: PropTypes.string,
    timezone: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};
