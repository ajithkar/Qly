import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';

import { billing } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';

export default function Billing() {
  const query = useQuery({ queryKey: ['subscription'], queryFn: billing.subscription });

  if (query.isLoading) return <FullPageSpinner label="Loading your plan" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const { subscription, plan, tenant_status: tenantStatus } = query.data;

  if (!plan) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No plan on file"
        description="Choose a plan to activate queues and appointments."
      />
    );
  }

  const limit = (value) => (value == null ? 'Unlimited' : value);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted">Your plan and what it includes.</p>
      </div>

      <Card>
        <CardHeader
          title={String(plan.name ?? plan.code)}
          description={`Billed ${subscription?.billing_cycle ?? 'monthly'}`}
          action={
            <Badge tone={tenantStatus === 'active' ? 'open' : 'paused'}>
              {tenantStatus ?? 'unknown'}
            </Badge>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Branches" value={limit(plan.max_branches)} />
            <Stat label="Team" value={limit(plan.max_providers)} />
            <Stat label="Services" value={limit(plan.max_services)} />
            <Stat label="Monthly tokens" value={limit(plan.monthly_tokens)} />
          </div>

          {subscription?.stripe_status === 'past_due' && (
            <div className="mt-4 rounded-card border border-amber/30 bg-amber/10 px-4 py-3">
              <p className="text-sm font-medium text-amber">Payment did not go through</p>
              <p className="mt-0.5 text-sm text-muted">
                Update your card to keep queues running. Service continues during
                the grace period.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
