import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { ListOrdered, ArrowRight } from 'lucide-react';

import { queues } from '@/api/endpoints';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Table } from '@/components/ui/Table';

export default function VendorDashboard() {
  const queuesQuery = useQuery({
    queryKey: ['queues', { page: 1 }],
    queryFn: () => queues.list({ page: 1, page_size: 10 }),
  });

  const rows = queuesQuery.data?.data ?? [];
  const openCount = rows.filter((q) => q.status === 'open').length;

  // Charted from the queues actually returned — no placeholder series.
  const chartData = rows.slice(0, 7).map((queue) => ({
    name: queue.name.length > 12 ? `${queue.name.slice(0, 12)}…` : queue.name,
    capacity: queue.max_tokens ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted">
          Live queues and the numbers behind them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Queues open" value={openCount} tone="jade" />
        <Stat label="Queues total" value={rows.length} />
        <Stat
          label="Paused"
          value={rows.filter((q) => q.status === 'paused').length}
          tone="amber"
        />
        <Stat
          label="Closed"
          value={rows.filter((q) => q.status === 'closed').length}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="Queues"
            description="Open a console to start calling."
            action={
              <Link to="/vendor/queues">
                <Button variant="secondary" size="sm">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </Link>
            }
          />
          {queuesQuery.isLoading && <SkeletonRows />}
          {queuesQuery.isError && (
            <ErrorState error={queuesQuery.error} onRetry={queuesQuery.refetch} />
          )}
          {queuesQuery.isSuccess && (
            <Table
              rows={rows}
              empty={
                <EmptyState
                  icon={ListOrdered}
                  title="No queues yet"
                  description="Create a queue for a service, then start it to issue tokens."
                  action={
                    <Link to="/vendor/queues">
                      <Button size="sm">Create a queue</Button>
                    </Link>
                  }
                />
              }
              columns={[
                { key: 'name', header: 'Queue' },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status} /> },
                {
                  key: 'business_day',
                  header: 'Day',
                  render: (r) => <span className="text-muted tabular">{r.business_day}</span>,
                },
                {
                  key: 'open',
                  header: '',
                  align: 'right',
                  render: (r) => (
                    <Link
                      to={`/vendor/queues/${r.id}/console`}
                      className="text-sm font-medium text-signal hover:underline"
                    >
                      Open console
                    </Link>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Capacity by queue" />
          <CardBody>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis
                    dataKey="name" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                    axisLine={false} tickLine={false} width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(var(--surface))',
                      border: '1px solid rgb(var(--line))',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="capacity" fill="rgb(var(--signal))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted">
                Capacity appears once you create a queue.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
