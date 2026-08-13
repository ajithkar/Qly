import { useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard } from 'lucide-react';

import { billing } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

const limit = (value) => (value == null ? 'Unlimited' : value);

const money = (value) =>
  value === 0 ? 'Free' : `LKR ${Number(value).toLocaleString()}`;

const daysLeft = (isoDate) => {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const FEATURES = [
  { key: 'max_branches', label: (p) => `${limit(p.max_branches)} branches` },
  { key: 'max_providers', label: (p) => `${limit(p.max_providers)} team members` },
  { key: 'max_services', label: (p) => `${limit(p.max_services)} services` },
  { key: 'monthly_tokens', label: (p) => `${limit(p.monthly_tokens)} tokens / month` },
  { key: 'reports_access', label: () => 'Reports', when: (p) => p.reports_access },
  { key: 'export_access', label: () => 'Data export', when: (p) => p.export_access },
  { key: 'api_access', label: () => 'API access', when: (p) => p.api_access },
];

function PlanCard({ plan, currentCode, cycle, isRequesting, canRequest, onRequest }) {
  const isCurrent = plan.code === currentCode;
  const price = cycle === 'yearly' ? plan.yearly_price : plan.monthly_price;

  return (
    <Card className={cn('flex flex-col', isCurrent && 'border-signal/40 ring-1 ring-signal/20')}>
      <CardHeader
        title={plan.name}
        action={isCurrent ? <Badge tone="open">Current plan</Badge> : null}
      />
      <CardBody className="flex flex-1 flex-col">
        <p className="font-mono text-3xl font-bold tabular">
          {money(price)}
          {price > 0 && (
            <span className="ml-1 text-sm font-normal text-muted">
              /{cycle === 'yearly' ? 'yr' : 'mo'}
            </span>
          )}
        </p>
        {plan.is_trial && (
          <p className="mt-1 text-xs text-muted">For your first 30 days, once per organisation</p>
        )}

        <ul className="mt-4 flex-1 space-y-2 text-sm">
          {FEATURES.filter((f) => !f.when || f.when(plan)).map((f) => (
            <li key={f.key} className="flex items-center gap-2 text-secondary">
              <Check className="h-3.5 w-3.5 shrink-0 text-jade" aria-hidden="true" />
              {f.label(plan)}
            </li>
          ))}
        </ul>

        <Button
          className="mt-5 w-full"
          variant={isCurrent ? 'secondary' : 'primary'}
          disabled={isCurrent || !canRequest}
          loading={isRequesting}
          onClick={() => onRequest(plan)}
        >
          {isCurrent ? 'Current plan' : plan.is_trial ? 'Start free trial' : 'Request upgrade'}
        </Button>
      </CardBody>
    </Card>
  );
}

PlanCard.propTypes = {
  plan: PropTypes.shape({
    code: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    monthly_price: PropTypes.number.isRequired,
    yearly_price: PropTypes.number.isRequired,
    max_branches: PropTypes.number,
    max_providers: PropTypes.number,
    max_services: PropTypes.number,
    monthly_tokens: PropTypes.number,
    reports_access: PropTypes.bool,
    export_access: PropTypes.bool,
    api_access: PropTypes.bool,
    is_trial: PropTypes.bool,
  }).isRequired,
  currentCode: PropTypes.string,
  cycle: PropTypes.oneOf(['monthly', 'yearly']).isRequired,
  isRequesting: PropTypes.bool,
  canRequest: PropTypes.bool,
  onRequest: PropTypes.func.isRequired,
};

export default function Billing() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canRequest = can('billing:update');
  const [cycle, setCycle] = useState('monthly');
  const [pendingPlan, setPendingPlan] = useState(null);

  const subscriptionQuery = useQuery({ queryKey: ['subscription'], queryFn: billing.subscription });
  const plansQuery = useQuery({ queryKey: ['billing-plans'], queryFn: billing.plans });

  const checkout = useMutation({
    mutationFn: () => billing.checkout({ plan_code: pendingPlan.code, billing_cycle: cycle }),
    onSuccess: ({ checkout_url: checkoutUrl, activated, trial_ends_at: trialEndsAt }) => {
      if (activated) {
        const remaining = daysLeft(trialEndsAt);
        toast.success(
          remaining ? `Your free trial is active for the next ${remaining} days.` : 'Your free trial is active.',
        );
        setPendingPlan(null);
        queryClient.invalidateQueries({ queryKey: ['subscription'] });
        queryClient.invalidateQueries({ queryKey: ['billing-plans'] });
        return;
      }
      window.location.href = checkoutUrl;
    },
    onError: (error) => {
      toast.error(error.message);
      setPendingPlan(null);
    },
  });

  if (subscriptionQuery.isLoading || plansQuery.isLoading) {
    return <FullPageSpinner label="Loading your plan" />;
  }
  if (subscriptionQuery.isError) {
    return <ErrorState error={subscriptionQuery.error} onRetry={subscriptionQuery.refetch} />;
  }
  if (plansQuery.isError) {
    return <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />;
  }

  const { subscription, plan, tenant_status: tenantStatus } = subscriptionQuery.data;
  const plans = plansQuery.data;
  const trialDaysLeft = subscription?.stripe_status === 'trialing'
    ? daysLeft(subscription.trial_ends_at)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted">Your plan and what it includes.</p>
      </div>

      {!plan ? (
        <EmptyState
          icon={CreditCard}
          title="No plan on file"
          description="Choose a plan below to activate queues and appointments."
        />
      ) : (
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

            {trialDaysLeft !== null && (
              <div
                className={cn(
                  'mt-4 rounded-card border px-4 py-3',
                  trialDaysLeft > 0 ? 'border-signal/30 bg-signal/10' : 'border-amber/30 bg-amber/10',
                )}
              >
                <p className={cn('text-sm font-medium', trialDaysLeft > 0 ? 'text-signal' : 'text-amber')}>
                  {trialDaysLeft > 0
                    ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your free trial`
                    : 'Your free trial has ended'}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {trialDaysLeft > 0
                    ? 'Pick a paid plan below any time to continue without interruption.'
                    : 'Choose a paid plan below to keep adding branches, staff and services.'}
                </p>
              </div>
            )}

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
      )}

      {plans.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Change plan</h2>
              <p className="text-sm text-muted">
                {canRequest
                  ? "Request an upgrade or downgrade - it takes effect once payment is confirmed."
                  : 'Ask an account owner to change your plan.'}
              </p>
            </div>
            <div className="inline-flex rounded-button border border-line bg-paper p-1 text-sm">
              {['monthly', 'yearly'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCycle(option)}
                  className={cn(
                    'rounded-[calc(var(--radius-button)-4px)] px-3 py-1 capitalize transition',
                    cycle === option ? 'bg-surface shadow-soft text-ink' : 'text-muted',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <PlanCard
                key={p.code}
                plan={p}
                currentCode={plan?.code}
                cycle={cycle}
                canRequest={canRequest}
                isRequesting={checkout.isPending && pendingPlan?.code === p.code}
                onRequest={setPendingPlan}
              />
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(pendingPlan)}
        onClose={() => setPendingPlan(null)}
        title={pendingPlan ? `Switch to ${pendingPlan.name}` : ''}
        description={
          pendingPlan?.is_trial
            ? "Your 30-day free trial starts immediately - no payment required. Each organisation can only do this once."
            : "You'll be taken to Stripe to complete payment. Your plan changes once payment is confirmed - not before."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingPlan(null)}>
              Cancel
            </Button>
            <Button loading={checkout.isPending} onClick={() => checkout.mutate()}>
              {pendingPlan?.is_trial ? 'Start free trial' : 'Continue to payment'}
            </Button>
          </>
        }
      >
        {pendingPlan && !pendingPlan.is_trial && (
          <p className="text-sm text-muted">
            {money(cycle === 'yearly' ? pendingPlan.yearly_price : pendingPlan.monthly_price)}
            {' '}billed {cycle}.
          </p>
        )}
      </Dialog>
    </div>
  );
}
