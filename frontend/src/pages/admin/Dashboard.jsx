import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2 } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Stat } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { formatDate } from '@/lib/cn';

export default function AdminDashboard() {
  const query = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: admin.dashboard });

  if (query.isLoading) return <FullPageSpinner label="Loading platform metrics" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const d = query.data;
  const money = (value) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Platform</h1>
          <p className="text-sm text-muted">
            Every figure below is computed live - none are placeholders.
          </p>
        </div>
        {d.generated_at && (
          <p className="pt-1 text-xs text-muted">As of {formatDate(d.generated_at)}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="MRR" value={money(d.mrr)} tone="signal" />
        <Stat label="ARR" value={money(d.arr)} tone="signal" />
        <Stat label="Paid vendors" value={d.paid_vendors} tone="jade" />
        <Stat label="Free vendors" value={d.free_vendors} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total vendors" value={d.total_vendors} />
        <Stat label="Active vendors" value={d.active_vendors} tone="jade" />
        <Stat
          label="Suspended vendors"
          value={d.suspended_vendors}
          tone={d.suspended_vendors > 0 ? 'rose' : 'default'}
        />
        <Stat label="End users" value={d.total_end_users} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Appointments today" value={d.todays_appointments} />
        <Stat label="Active queues" value={d.active_queues} tone="jade" />
        <Stat label="Tokens issued today" value={d.tokens_issued_today} />
      </div>

      {d.suspended_vendors > 0 && (
        <Card>
          <CardHeader
            title="Vendors need attention"
            description={`${d.suspended_vendors} vendor${d.suspended_vendors === 1 ? ' is' : 's are'} currently suspended.`}
            action={
              <Link to="/admin/vendors">
                <Button variant="secondary" size="sm">
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Review vendors
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </Link>
            }
          />
        </Card>
      )}
    </div>
  );
}
