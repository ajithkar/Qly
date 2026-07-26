import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input, Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/cn';

const STATUS_TONE = { active: 'open', suspended: 'closed', pending: 'paused', cancelled: 'neutral' };

export default function AdminVendors() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['admin', 'vendors', { page, search, status }],
    queryFn: () => admin.vendors({ page, page_size: 20, search: search || undefined, status: status || undefined }),
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Vendors</h1>
        <p className="text-sm text-muted">Every organisation on the platform.</p>
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
                  render: (r) =>
                    canUpdate ? (
                      r.status === 'suspended' ? (
                        <Button
                          variant="secondary" size="sm"
                          loading={reactivate.isPending && reactivate.variables === r.id}
                          onClick={() => reactivate.mutate(r.id)}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          variant="danger" size="sm"
                          loading={suspend.isPending && suspend.variables === r.id}
                          onClick={() => suspend.mutate(r.id)}
                        >
                          Suspend
                        </Button>
                      )
                    ) : null,
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
