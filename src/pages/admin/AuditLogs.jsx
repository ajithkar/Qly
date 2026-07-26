import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { formatDate, formatTime } from '@/lib/cn';

export default function AdminAuditLogs() {
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState('');

  const listQuery = useQuery({
    queryKey: ['admin', 'audit-logs', { page, tenantId }],
    queryFn: () => admin.auditLogs({ page, page_size: 30, tenant_id: tenantId || undefined }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Audit logs</h1>
        <p className="text-sm text-muted">
          Append-only. Every admin action - suspensions, plan edits, impersonation - lands here.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Recent activity"
          action={
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                value={tenantId}
                onChange={(e) => { setTenantId(e.target.value); setPage(1); }}
                placeholder="Filter by tenant ID"
                className="w-56 pl-8 font-mono text-xs"
                aria-label="Filter by tenant ID"
              />
            </div>
          }
        />
        {listQuery.isLoading && <SkeletonRows columns={5} />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={ScrollText}
                  title="Nothing recorded yet"
                  description="Actions taken from this portal will show up here."
                />
              }
              columns={[
                {
                  key: 'created_at',
                  header: 'When',
                  render: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.created_at)} {formatTime(r.created_at)}</span>,
                },
                { key: 'actor_email', header: 'Actor', render: (r) => r.actor_email ?? r.actor_id ?? '—' },
                { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
                { key: 'module', header: 'Module', render: (r) => <span className="text-muted">{r.module}</span> },
                {
                  key: 'resource_id',
                  header: 'Resource',
                  render: (r) => <span className="font-mono text-xs text-muted">{r.resource_id ?? '—'}</span>,
                },
                { key: 'ip_address', header: 'IP', render: (r) => <span className="text-muted">{r.ip_address ?? '—'}</span> },
              ]}
            />
            <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
