import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

const EMPTY_FORM = {
  code: '', name: '', monthly_price: 0, yearly_price: 0,
  max_branches: '', max_providers: '', max_staff: '', max_services: '',
  monthly_tokens: '', storage_mb: '',
  reports_access: true, export_access: true, api_access: false,
  feature_flags: '', is_trial: false, archived: false,
};

const numOrNull = (value) => (value === '' || value === null ? null : Number(value));

export default function AdminPlans() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null); // null | { mode: 'create' } | { mode: 'edit', plan }

  const listQuery = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => admin.plans({ page_size: 100 }),
  });

  const create = useMutation({
    mutationFn: (data) => admin.createPlan(data),
    onSuccess: () => {
      toast.success('Plan created');
      setDialog(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => admin.updatePlan(id, data),
    onSuccess: () => {
      toast.success('Plan updated');
      setDialog(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const canWrite = can('admin_plans:create') || can('admin_plans:update');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Plans</h1>
          <p className="text-sm text-muted">What every vendor&apos;s subscription is measured against.</p>
        </div>
        {can('admin_plans:create') && (
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New plan
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title="All plans" icon={Package} />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <Table
            rows={listQuery.data.data}
            empty={
              <EmptyState
                icon={Package}
                title="No plans yet"
                description="Create the first plan vendors can subscribe to."
              />
            }
            columns={[
              {
                key: 'name',
                header: 'Plan',
                render: (r) => (
                  <div>
                    <p className="font-medium">
                      {r.name}
                      {r.is_trial && <Badge tone="paused" className="ml-2">Trial</Badge>}
                    </p>
                    <p className="font-mono text-xs text-muted">{r.code}</p>
                  </div>
                ),
              },
              {
                key: 'monthly_price',
                header: 'Monthly',
                render: (r) => <span className="tabular">LKR {r.monthly_price.toLocaleString()}</span>,
              },
              {
                key: 'yearly_price',
                header: 'Yearly',
                render: (r) => <span className="tabular">LKR {r.yearly_price.toLocaleString()}</span>,
              },
              {
                key: 'limits',
                header: 'Limits',
                render: (r) => (
                  <span className="text-xs text-muted">
                    {r.max_branches ?? '∞'} branches · {r.max_providers ?? '∞'} providers ·{' '}
                    {r.max_services ?? '∞'} services
                  </span>
                ),
              },
              {
                key: 'archived',
                header: 'Status',
                render: (r) => <Badge tone={r.archived ? 'closed' : 'open'}>{r.archived ? 'Archived' : 'Active'}</Badge>,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) =>
                  canWrite && (
                    <Button variant="secondary" size="sm" onClick={() => setDialog({ mode: 'edit', plan: r })}>
                      Edit
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Card>

      <PlanDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onCreate={(data) => create.mutate(data)}
        onUpdate={(id, data) => update.mutate({ id, data })}
        loading={create.isPending || update.isPending}
      />
    </div>
  );
}

function PlanDialog({ state, onClose, onCreate, onUpdate, loading }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const mode = state?.mode;

  useEffect(() => {
    if (mode === 'edit') {
      const p = state.plan;
      setForm({
        code: p.code, name: p.name,
        monthly_price: p.monthly_price, yearly_price: p.yearly_price,
        max_branches: p.max_branches ?? '', max_providers: p.max_providers ?? '',
        max_staff: p.max_staff ?? '', max_services: p.max_services ?? '',
        monthly_tokens: p.monthly_tokens ?? '', storage_mb: p.storage_mb ?? '',
        reports_access: p.reports_access, export_access: p.export_access,
        api_access: p.api_access, feature_flags: p.feature_flags.join(', '),
        is_trial: p.is_trial, archived: p.archived,
      });
    } else if (mode === 'create') {
      setForm(EMPTY_FORM);
    }
  }, [mode, state]);

  if (!mode) return null;

  const set = (key, kind = 'text') => (event) => {
    const raw = event.target;
    const value = kind === 'number' ? raw.value
      : kind === 'checkbox' ? raw.checked
      : raw.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = () => ({
    name: form.name,
    monthly_price: Number(form.monthly_price),
    yearly_price: Number(form.yearly_price),
    max_branches: numOrNull(form.max_branches),
    max_providers: numOrNull(form.max_providers),
    max_staff: numOrNull(form.max_staff),
    max_services: numOrNull(form.max_services),
    monthly_tokens: numOrNull(form.monthly_tokens),
    storage_mb: numOrNull(form.storage_mb),
    reports_access: form.reports_access,
    export_access: form.export_access,
    api_access: form.api_access,
    feature_flags: form.feature_flags.split(',').map((f) => f.trim()).filter(Boolean),
    is_trial: form.is_trial,
    ...(mode === 'edit' ? { archived: form.archived } : {}),
  });

  const valid = form.name.trim() && (mode === 'edit' || /^[a-z0-9_-]+$/.test(form.code));

  return (
    <Dialog
      open={Boolean(mode)}
      onClose={onClose}
      title={mode === 'create' ? 'New plan' : `Edit ${state.plan.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={loading}
            disabled={!valid}
            onClick={() =>
              mode === 'create' ? onCreate({ ...buildPayload(), code: form.code }) : onUpdate(state.plan.id, buildPayload())
            }
          >
            {mode === 'create' ? 'Create plan' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="p-name" required>
            <Input id="p-name" value={form.name} onChange={set('name')} placeholder="Business" />
          </Field>
          <Field
            label="Code" htmlFor="p-code" required={mode === 'create'}
            hint={mode === 'edit' ? 'Code cannot be changed' : 'lowercase, e.g. business'}
          >
            <Input
              id="p-code" value={form.code} onChange={set('code')}
              disabled={mode === 'edit'} placeholder="business"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly price (LKR)" htmlFor="p-monthly">
            <Input
              id="p-monthly" type="number" min="0" step="1"
              value={form.monthly_price} onChange={set('monthly_price', 'number')}
            />
          </Field>
          <Field label="Yearly price (LKR)" htmlFor="p-yearly">
            <Input
              id="p-yearly" type="number" min="0" step="1"
              value={form.yearly_price} onChange={set('yearly_price', 'number')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Max branches" htmlFor="p-branches" hint="Blank = unlimited">
            <Input id="p-branches" type="number" min="1" value={form.max_branches} onChange={set('max_branches', 'number')} />
          </Field>
          <Field label="Max providers" htmlFor="p-providers" hint="Blank = unlimited">
            <Input id="p-providers" type="number" min="1" value={form.max_providers} onChange={set('max_providers', 'number')} />
          </Field>
          <Field label="Max staff" htmlFor="p-staff" hint="Blank = unlimited">
            <Input id="p-staff" type="number" min="1" value={form.max_staff} onChange={set('max_staff', 'number')} />
          </Field>
          <Field label="Max services" htmlFor="p-services" hint="Blank = unlimited">
            <Input id="p-services" type="number" min="1" value={form.max_services} onChange={set('max_services', 'number')} />
          </Field>
          <Field label="Monthly tokens" htmlFor="p-tokens" hint="Blank = unlimited">
            <Input id="p-tokens" type="number" min="1" value={form.monthly_tokens} onChange={set('monthly_tokens', 'number')} />
          </Field>
          <Field label="Storage (MB)" htmlFor="p-storage" hint="Blank = unlimited">
            <Input id="p-storage" type="number" min="1" value={form.storage_mb} onChange={set('storage_mb', 'number')} />
          </Field>
        </div>

        <Field label="Feature flags" htmlFor="p-flags" hint="Comma separated, e.g. priority_queue, api_keys">
          <Input id="p-flags" value={form.feature_flags} onChange={set('feature_flags')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reports access" htmlFor="p-reports">
            <Select
              id="p-reports"
              value={form.reports_access ? '1' : '0'}
              onChange={(e) => setForm((prev) => ({ ...prev, reports_access: e.target.value === '1' }))}
            >
              <option value="1">Included</option>
              <option value="0">Not included</option>
            </Select>
          </Field>
          <Field label="Export access" htmlFor="p-export">
            <Select
              id="p-export"
              value={form.export_access ? '1' : '0'}
              onChange={(e) => setForm((prev) => ({ ...prev, export_access: e.target.value === '1' }))}
            >
              <option value="1">Included</option>
              <option value="0">Not included</option>
            </Select>
          </Field>
          <Field label="API access" htmlFor="p-api">
            <Select
              id="p-api"
              value={form.api_access ? '1' : '0'}
              onChange={(e) => setForm((prev) => ({ ...prev, api_access: e.target.value === '1' }))}
            >
              <option value="1">Included</option>
              <option value="0">Not included</option>
            </Select>
          </Field>
          <Field label="Free trial" htmlFor="p-trial" hint="One-time, no payment required">
            <Select
              id="p-trial"
              value={form.is_trial ? '1' : '0'}
              onChange={(e) => setForm((prev) => ({ ...prev, is_trial: e.target.value === '1' }))}
            >
              <option value="0">Regular plan</option>
              <option value="1">Trial plan</option>
            </Select>
          </Field>
          {mode === 'edit' && (
            <Field label="Visibility" htmlFor="p-archived">
              <Select
                id="p-archived"
                value={form.archived ? '1' : '0'}
                onChange={(e) => setForm((prev) => ({ ...prev, archived: e.target.value === '1' }))}
              >
                <option value="0">Active</option>
                <option value="1">Archived</option>
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

PlanDialog.propTypes = {
  state: PropTypes.shape({
    mode: PropTypes.oneOf(['create', 'edit']),
    plan: PropTypes.object,
  }),
  onClose: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};
