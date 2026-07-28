import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Copy, CreditCard, KeyRound, Plus, Search } from 'lucide-react';

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
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/cn';

const STATUS_TONE = { active: 'open', suspended: 'closed', pending: 'paused', cancelled: 'neutral' };

const EMPTY_FORM = {
  company_name: '', owner_name: '', email: '',
  plan_code: '', timezone: 'UTC', currency: 'USD', billing_cycle: 'monthly',
};

async function copyToClipboard(value, kind, setCopied, toast) {
  try {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
  } catch {
    toast.error('Could not copy - select and copy manually.');
  }
}

export default function AdminVendors() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentLink, setPaymentLink] = useState(null); // { company_name, checkout_url }
  const [credentials, setCredentials] = useState(null); // { company_name, email, password }
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['admin', 'vendors', { page, search, status }],
    queryFn: () => admin.vendors({ page, page_size: 20, search: search || undefined, status: status || undefined }),
  });

  const plansQuery = useQuery({
    queryKey: ['admin', 'plans', 'all'],
    queryFn: () => admin.plans({ page_size: 100 }),
    enabled: dialogOpen,
  });

  const createVendor = useMutation({
    mutationFn: (data) => admin.createVendor(data),
    onSuccess: (vendor) => {
      setDialogOpen(false);
      setPaymentLink({ company_name: vendor.company_name, checkout_url: vendor.checkout_url });
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const getPaymentLink = useMutation({
    mutationFn: (vendorRow) => admin.vendorCheckout(vendorRow.id).then((r) => ({ ...r, vendorRow })),
    onSuccess: ({ checkout_url, vendorRow }) =>
      setPaymentLink({ company_name: vendorRow.company_name, checkout_url }),
    onError: (error) => toast.error(error.message),
  });

  const getCredentials = useMutation({
    mutationFn: (vendorRow) => admin.vendorCredentials(vendorRow.id).then((r) => ({ ...r, vendorRow })),
    onSuccess: ({ email, password, vendorRow }) =>
      setCredentials({ company_name: vendorRow.company_name, email, password }),
    onError: (error) => toast.error(error.message),
  });

  const suspend = useMutation({
    mutationFn: (id) => admin.suspendVendor(id),
    onSuccess: () => {
      toast.success('Vendor suspended');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const reactivate = useMutation({
    mutationFn: (id) => admin.reactivateVendor(id),
    onSuccess: () => {
      toast.success('Vendor reactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const canUpdate = can('admin_vendors:update');
  const canCreate = can('admin_vendors:create');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted">Every organisation on the platform.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create vendor
          </Button>
        )}
      </div>

      <Card>
        <CardHeader
          title="All vendors"
          action={
            <div className="flex gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search company or email"
                  className="w-56 pl-8"
                  aria-label="Search vendors"
                />
              </div>
              <Select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="w-40"
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
          }
        />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={Building2}
                  title="No vendors match"
                  description="Try a different search or status filter."
                />
              }
              columns={[
                {
                  key: 'company_name',
                  header: 'Company',
                  render: (r) => (
                    <Link to={`/admin/vendors/${r.id}`} className="font-medium text-signal hover:underline">
                      {r.company_name ?? r.slug ?? r.id}
                    </Link>
                  ),
                },
                { key: 'owner_email', header: 'Owner', render: (r) => r.owner_email ?? '—' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>,
                },
                {
                  key: 'plan_code',
                  header: 'Plan',
                  render: (r) => <span className="capitalize text-muted">{r.plan_code ?? '—'}</span>,
                },
                {
                  key: 'created_at',
                  header: 'Joined',
                  render: (r) => <span className="text-muted">{formatDate(r.created_at)}</span>,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (r) => (
                    <div className="flex justify-end gap-2">
                      {r.status === 'pending' && canUpdate && (
                        <Button
                          variant="secondary" size="sm"
                          loading={getPaymentLink.isPending && getPaymentLink.variables?.id === r.id}
                          onClick={() => getPaymentLink.mutate(r)}
                        >
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                          Payment link
                        </Button>
                      )}
                      {r.status === 'active' && (
                        <Button
                          variant="secondary" size="sm"
                          loading={getCredentials.isPending && getCredentials.variables?.id === r.id}
                          onClick={() => getCredentials.mutate(r)}
                        >
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                          Credentials
                        </Button>
                      )}
                      {canUpdate && (
                        r.status === 'suspended' ? (
                          <Button
                            variant="secondary" size="sm"
                            loading={reactivate.isPending && reactivate.variables === r.id}
                            onClick={() => reactivate.mutate(r.id)}
                          >
                            Reactivate
                          </Button>
                        ) : r.status !== 'pending' ? (
                          <Button
                            variant="danger" size="sm"
                            loading={suspend.isPending && suspend.variables === r.id}
                            onClick={() => suspend.mutate(r.id)}
                          >
                            Suspend
                          </Button>
                        ) : null
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

      <CreateVendorDialog
        open={dialogOpen}
        plans={plansQuery.data?.data ?? []}
        onClose={() => setDialogOpen(false)}
        onCreate={(data) => createVendor.mutate(data)}
        loading={createVendor.isPending}
      />

      <CopyDialog
        open={Boolean(paymentLink)}
        onClose={() => setPaymentLink(null)}
        title={`Payment link${paymentLink ? ` — ${paymentLink.company_name}` : ''}`}
        description="Send this to the vendor. Their account activates automatically once Stripe confirms payment."
        fields={paymentLink ? [{ key: 'link', label: 'Checkout link', value: paymentLink.checkout_url }] : []}
      />

      <CopyDialog
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title={`Login credentials${credentials ? ` — ${credentials.company_name}` : ''}`}
        description="The same credentials that were emailed to the vendor."
        fields={credentials ? [
          { key: 'email', label: 'Login email', value: credentials.email },
          { key: 'password', label: 'Password', value: credentials.password, monospace: true },
        ] : []}
      />
    </div>
  );
}

function CopyDialog({ open, onClose, title, description, fields }) {
  const toast = useToast();
  const [copied, setCopied] = useState(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {fields.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={`copy-${field.key}`}>
            <div className="flex gap-2">
              <Input
                id={`copy-${field.key}`} readOnly value={field.value}
                className={field.monospace ? 'font-mono text-sm' : 'text-sm'}
              />
              <Button
                variant="secondary" size="sm"
                onClick={() => copyToClipboard(field.value, field.key, setCopied, toast)}
              >
                {copied === field.key ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </Field>
        ))}
      </div>
    </Dialog>
  );
}

CopyDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  description: PropTypes.node,
  fields: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    monospace: PropTypes.bool,
  })).isRequired,
};

function CreateVendorDialog({ open, plans, onClose, onCreate, loading }) {
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const close = useCallback(() => {
    setForm(EMPTY_FORM);
    onClose();
  }, [onClose]);

  const valid =
    form.company_name.trim().length >= 2 &&
    form.owner_name.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    Boolean(form.plan_code) &&
    form.currency.trim().length === 3;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Create vendor"
      description="The vendor stays pending until they pay - you'll get a payment link to send them next."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button
            loading={loading}
            disabled={!valid}
            onClick={() => {
              onCreate({ ...form, currency: form.currency.toUpperCase() });
              setForm(EMPTY_FORM);
            }}
          >
            Create vendor
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company name" htmlFor="v-company" required>
            <Input id="v-company" value={form.company_name} onChange={set('company_name')} placeholder="Acme Clinic" />
          </Field>
          <Field label="Owner name" htmlFor="v-owner" required>
            <Input id="v-owner" value={form.owner_name} onChange={set('owner_name')} placeholder="Jane Doe" />
          </Field>
        </div>

        <Field label="Owner email" htmlFor="v-email" required>
          <Input id="v-email" type="email" value={form.email} onChange={set('email')} placeholder="owner@acme.com" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan" htmlFor="v-plan" required>
            <Select id="v-plan" value={form.plan_code} onChange={set('plan_code')}>
              <option value="">Select a plan</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Billing cycle" htmlFor="v-cycle">
            <Select id="v-cycle" value={form.billing_cycle} onChange={set('billing_cycle')}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Timezone" htmlFor="v-timezone">
            <Input id="v-timezone" value={form.timezone} onChange={set('timezone')} placeholder="UTC" />
          </Field>
          <Field label="Currency" htmlFor="v-currency" hint="3-letter code">
            <Input id="v-currency" value={form.currency} onChange={set('currency')} maxLength={3} placeholder="USD" />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

CreateVendorDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  plans: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};
