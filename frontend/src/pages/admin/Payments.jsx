import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { formatDate, formatTime } from '@/lib/cn';

export default function AdminPayments() {
  const [page, setPage] = useState(1);
  const [processed, setProcessed] = useState('');

  const listQuery = useQuery({
    queryKey: ['admin', 'stripe-events', { page, processed }],
    queryFn: () => admin.stripeEvents({
      page, page_size: 25,
      processed: processed === '' ? undefined : processed === '1',
    }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted">
          Every Stripe webhook this platform has received. Stripe is the only source of truth for billing state.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Stripe events"
          action={
            <Select
              value={processed}
              onChange={(e) => { setProcessed(e.target.value); setPage(1); }}
              className="w-44"
              aria-label="Filter by processed state"
            >
              <option value="">All events</option>
              <option value="1">Processed</option>
              <option value="0">Unprocessed</option>
            </Select>
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
                  icon={CreditCard}
                  title="No events yet"
                  description="They'll appear here once Stripe starts sending webhooks."
                />
              }
              columns={[
                { key: 'type', header: 'Event', render: (r) => <span className="font-mono text-xs">{r.type ?? '—'}</span> },
                { key: 'event_id', header: 'Event ID', render: (r) => <span className="font-mono text-xs text-muted">{r.event_id ?? '—'}</span> },
                {
                  key: 'processed',
                  header: 'Status',
                  render: (r) => <Badge tone={r.processed ? 'open' : 'paused'}>{r.processed ? 'Processed' : 'Pending'}</Badge>,
                },
                { key: 'attempts', header: 'Attempts', render: (r) => <span className="tabular">{r.attempts}</span> },
                {
                  key: 'created_at',
                  header: 'Received',
                  render: (r) => <span className="text-muted">{formatDate(r.created_at)} {formatTime(r.created_at)}</span>,
                },
              ]}
            />
            <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
