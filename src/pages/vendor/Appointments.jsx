import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';

import { appointments } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Pagination, Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatTime } from '@/lib/cn';

const STATUS_TONES = {
  booked: 'waiting', confirmed: 'called', checked_in: 'serving',
  completed: 'completed', cancelled: 'cancelled',
  no_show: 'no_show', rejected: 'skipped',
};

export default function Appointments() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['appointments', { page, status }],
    queryFn: () =>
      appointments.list({ page, page_size: 20, ...(status ? { status } : {}) }),
  });

  const checkIn = useMutation({
    mutationFn: (id) => appointments.checkIn(id),
    onSuccess: (token) => {
      toast.success(`Checked in — token ${token.token_number}`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error) => {
      if (error.code === 'no_open_queue') {
        toast.error('No queue is open for this service today. Start one first.');
        return;
      }
      toast.error(error.message);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted">
            Checking someone in puts them into the live queue.
          </p>
        </div>
        <Select
          value={status}
          onChange={(event) => { setStatus(event.target.value); setPage(1); }}
          className="w-auto"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="booked">Booked</option>
          <option value="confirmed">Confirmed</option>
          <option value="checked_in">Checked in</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <Card>
        <CardHeader title="Bookings" />
        {listQuery.isLoading && <SkeletonRows />}
        {listQuery.isError && <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.isSuccess && (
          <>
            <Table
              rows={listQuery.data.data}
              empty={
                <EmptyState
                  icon={CalendarDays}
                  title="No appointments"
                  description="Bookings appear here once customers reserve a slot."
                />
              }
              columns={[
                {
                  key: 'customer_name',
                  header: 'Customer',
                  render: (r) => r.customer_name || <span className="text-muted">—</span>,
                },
                {
                  key: 'slot_start',
                  header: 'When',
                  render: (r) => (
                    <span className="tabular">
                      {formatDate(r.slot_start)} · {formatTime(r.slot_start)}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <Badge tone={STATUS_TONES[r.status] ?? 'neutral'}>{r.status}</Badge>,
                },
                {
                  key: 'payment_status',
                  header: 'Payment',
                  render: (r) => <span className="text-muted">{r.payment_status}</span>,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (row) =>
                    ['booked', 'confirmed'].includes(row.status) ? (
                      <Button
                        variant="secondary" size="sm"
                        onClick={() => checkIn.mutate(row.id)}
                        loading={checkIn.isPending}
                      >
                        Check in
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
