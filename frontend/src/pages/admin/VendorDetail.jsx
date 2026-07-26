import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserCog } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/cn';

const STATUS_TONE = { active: 'open', suspended: 'closed', pending: 'paused', cancelled: 'neutral' };

export default function AdminVendorDetail() {
  const { vendorId } = useParams();
  const { can, adoptTokens } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmImpersonate, setConfirmImpersonate] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'vendors', vendorId],
    queryFn: () => admin.vendor(vendorId),
  });

  const suspend = useMutation({
    mutationFn: () => admin.suspendVendor(vendorId),
    onSuccess: () => {
      toast.success('Vendor suspended');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors', vendorId] });
    },
    onError: (error) => toast.error(error.message),
  });

  const reactivate = useMutation({
    mutationFn: () => admin.reactivateVendor(vendorId),
    onSuccess: () => {
      toast.success('Vendor reactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors', vendorId] });
    },
    onError: (error) => toast.error(error.message),
  });

  const impersonate = useMutation({
    mutationFn: () => admin.impersonateVendor(vendorId),
    onSuccess: async (pair) => {
      await adoptTokens(pair);
      toast.info('Signed in as the vendor owner. This session is audit-logged.');
      navigate('/vendor', { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isLoading) return <FullPageSpinner label="Loading vendor" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const { organisation: org, subscription, counts } = query.data;
  const canUpdate = can('admin_vendors:update');

  return (
    <div className="space-y-5">
      <Link to="/admin/vendors" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All vendors
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {org.company_name ?? org.slug}
          </h1>
          <p className="text-sm text-muted">{org.owner_email}</p>
        </div>
        <Badge tone={STATUS_TONE[org.status] ?? 'neutral'}>{org.status}</Badge>
      </div>

      {canUpdate && (
        <div className="flex flex-wrap gap-2">
          {org.status === 'suspended' ? (
            <Button variant="secondary" loading={reactivate.isPending} onClick={() => reactivate.mutate()}>
              Reactivate vendor
            </Button>
          ) : (
            <Button variant="danger" loading={suspend.isPending} onClick={() => suspend.mutate()}>
              Suspend vendor
            </Button>
          )}
          <Button variant="secondary" onClick={() => setConfirmImpersonate(true)}>
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Impersonate owner
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Branches" value={counts.branches} />
        <Stat label="Providers" value={counts.providers} />
        <Stat label="Services" value={counts.services} />
        <Stat label="Staff" value={counts.staff} />
        <Stat label="Appointments" value={counts.appointments} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Organisation" />
          <CardBody className="space-y-3">
            <Row label="Owner name" value={org.owner_name} />
            <Row label="Business type" value={org.business_type} />
            <Row label="Slug" value={org.slug} mono />
            <Row label="Timezone" value={org.timezone} />
            <Row label="Currency" value={org.currency} />
            <Row label="Plan" value={org.plan_code} capitalize />
            <Row label="Joined" value={formatDate(org.created_at)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Subscription" />
          <CardBody>
            {subscription ? (
              <div className="space-y-3">
                <Row label="Stripe status" value={subscription.stripe_status} capitalize />
                <Row label="Billing cycle" value={subscription.billing_cycle} capitalize />
                <Row label="Plan" value={subscription.plan_code} capitalize />
                <Row label="Renews / ends" value={formatDate(subscription.current_period_end)} />
              </div>
            ) : (
              <p className="text-sm text-muted">No subscription on file - this vendor is on the free tier.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmImpersonate}
        onClose={() => setConfirmImpersonate(false)}
        onConfirm={() => { setConfirmImpersonate(false); impersonate.mutate(); }}
        title="Impersonate this vendor's owner?"
        description="This ends your admin session and signs you in as the organisation owner instead. The action is recorded in the audit log regardless."
        confirmLabel="Impersonate"
        loading={impersonate.isPending}
      />
    </div>
  );
}

function Row({ label, value, mono, capitalize }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

Row.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node,
  mono: PropTypes.bool,
  capitalize: PropTypes.bool,
};
