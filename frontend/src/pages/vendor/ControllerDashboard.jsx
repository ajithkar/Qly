import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListOrdered, PhoneCall } from 'lucide-react';

import { queues } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

/**
 * The controller's home screen: every active queue at a glance, with
 * "Call next" one tap away. A controller's whole job is running the counter,
 * so this replaces the owner-facing business dashboard rather than sitting
 * behind another click.
 */
export default function ControllerDashboard() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ['queues-overview'],
    queryFn: () => queues.overview(),
    refetchInterval: 10000,
  });

  const callNext = useMutation({
    mutationFn: (queueId) => queues.callNext(queueId),
    onSuccess: (token) => {
      toast.success(`Called ${token.token_number}`);
      queryClient.invalidateQueries({ queryKey: ['queues-overview'] });
    },
    onError: (error) => {
      if (error?.code === 'queue_empty') {
        toast.info('Nobody is waiting.');
        return;
      }
      toast.error(error?.message ?? 'That action did not go through.');
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Queue control</h1>
        <p className="text-sm text-muted">Every active queue, one tap from calling the next person.</p>
      </div>

      {overviewQuery.isLoading && <SkeletonRows />}
      {overviewQuery.isError && (
        <ErrorState error={overviewQuery.error} onRetry={overviewQuery.refetch} />
      )}

      {overviewQuery.isSuccess && (
        overviewQuery.data.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No active queues"
            description="Start a queue to begin calling tokens."
            action={
              <Link to="/vendor/queues">
                <Button size="sm">Go to queues</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {overviewQuery.data.map((row) => (
              <Card key={row.queue_id}>
                <CardHeader
                  title={row.name}
                  action={<Badge tone={row.status} />}
                />
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Waiting</span>
                    <span className="font-mono font-bold tabular">{row.waiting_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Now serving</span>
                    <span className="font-mono tabular">
                      {row.current_token
                        ? row.current_token.customer_name || row.current_token.token_number
                        : '—'}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={row.status !== 'open'}
                      loading={callNext.isPending && callNext.variables === row.queue_id}
                      onClick={() => callNext.mutate(row.queue_id)}
                    >
                      <PhoneCall className="h-4 w-4" aria-hidden="true" />
                      Call next
                    </Button>
                    <Link to={`/vendor/queues/${row.queue_id}/console`}>
                      <Button size="sm" variant="secondary">Console</Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
