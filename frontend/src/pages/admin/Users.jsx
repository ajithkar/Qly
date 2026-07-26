import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users as UsersIcon } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/cn';

export default function AdminUsers() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['admin', 'users', { page, search }],
    queryFn: () => admin.users({ page, page_size: 20, search: search || undefined }),
  });

  const suspend = useMutation({
    mutationFn: (id) => admin.suspendUser(id),
    onSuccess: () => {
      toast.success('User suspended and signed out everywhere');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const canUpdate = can('admin_users:update');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">End users</h1>
        <p className="text-sm text-muted">Customers who book or queue through any vendor.</p>
      </div>

      <Card>
        <CardHeader
          title="All users"
          action={
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name or email"
                className="w-64 pl-8"
                aria-label="Search users"
              />
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
                <EmptyState icon={UsersIcon} title="No users match" description="Try a different search." />
              }
              columns={[
                { key: 'name', header: 'Name', render: (r) => r.name ?? '—' },
                { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <Badge tone={r.status === 'active' ? 'open' : 'closed'}>{r.status}</Badge>,
                },
                { key: 'created_at', header: 'Joined', render: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
                { key: 'last_login_at', header: 'Last seen', render: (r) => <span className="text-muted">{formatDate(r.last_login_at)}</span> },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (r) =>
                    canUpdate && r.status !== 'suspended' ? (
                      <Button
                        variant="danger" size="sm"
                        loading={suspend.isPending && suspend.variables === r.id}
                        onClick={() => suspend.mutate(r.id)}
                      >
                        Suspend
                      </Button>
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
