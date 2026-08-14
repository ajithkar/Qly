import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowRight, Building2, DollarSign, ShieldAlert, Users, Wallet,
} from 'lucide-react';

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
  const money = (value) => `LKR ${value.toLocaleString()}`;

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
        <Stat label="MRR" value={money(d.mrr)} tone="signal" icon={DollarSign} />
        <Stat label="ARR" value={money(d.arr)} tone="signal" icon={Wallet} />
        <Stat label="Paid vendors" value={d.paid_vendors} tone="jade" icon={Building2} />
        <Stat label="Free vendors" value={d.free_vendors} icon={Building2} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total vendors" value={d.total_vendors} icon={Building2} />
        <Stat label="Active vendors" value={d.active_vendors} tone="jade" icon={Building2} />
        <Stat
          label="Suspended vendors"
          value={d.suspended_vendors}
          tone={d.suspended_vendors > 0 ? 'rose' : 'default'}
          icon={ShieldAlert}
        />
        <Stat label="End users" value={d.total_end_users} icon={Users} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Appointments today" value={d.todays_appointments} />
        <Stat label="Active queues" value={d.active_queues} tone="jade" />
        <Stat label="Tokens issued today" value={d.tokens_issued_today} />
      </div>

      <Card>
        <CardHeader title="Vendor mix" description="Where today's vendors stand, at a glance." />
        <div className="px-2 pb-4 pt-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              layout="vertical"
              data={[
                { name: 'Paid', value: d.paid_vendors },
                { name: 'Free', value: d.free_vendors },
                { name: 'Active', value: d.active_vendors },
                { name: 'Suspended', value: d.suspended_vendors },
              ]}
              margin={{ left: 8, right: 24 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category" dataKey="name" width={80}
                tick={{ fontSize: 12, fill: 'rgb(var(--muted))' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgb(var(--paper))' }}
                contentStyle={{
                  background: 'rgb(var(--surface))',
                  border: '1px solid rgb(var(--line))',
                  borderRadius: 14,
                  fontSize: 12,
                  boxShadow: '0 8px 24px rgb(0 0 0 / 0.10)',
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                {['signal', 'muted', 'jade', 'rose'].map((tone) => (
                  <Cell key={tone} fill={`rgb(var(--${tone}))`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

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
