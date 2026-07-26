import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, PhoneCall, Pause, Play, Plus,
  SkipForward, UserX, Radio, RadioTower,
} from 'lucide-react';

import { queues } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useQueueSocket } from '@/hooks/useQueueSocket';
import { CallBoard, UpNext } from '@/components/CallBoard';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatMinutes, formatTime } from '@/lib/cn';

/**
 * The Operator Console.
 *
 * Design intent: someone standing at a counter needs to answer one question
 * without hesitating — who do I call next? So the board and the Call next
 * button are the two largest things on screen, and everything else is
 * secondary detail arranged beneath them.
 *
 * The backend guards every transition, so a 409 here means another operator
 * acted first. That is normal in a two-desk clinic, not a failure, and the
 * message says so plainly.
 */
export default function OperatorConsole() {
  const { queueId } = useParams();
  const { principal } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [walkInOpen, setWalkInOpen] = useState(false);

  const tenantId = principal?.tenant_id;

  const monitorQuery = useQuery({
    queryKey: ['queue-monitor', queueId],
    queryFn: () => queues.monitor(queueId),
    // Polling is the fallback when the socket is down; the socket makes this
    // effectively idle when connected.
    refetchInterval: 15000,
  });

  const waitingQuery = useQuery({
    queryKey: ['queue-tokens', queueId],
    queryFn: () => queues.tokens(queueId, { page_size: 50, sort: 'sequence', order: 'asc' }),
  });

  const applySocketUpdate = useCallback(
    (message) => {
      if (message.type === 'queue_update') {
        queryClient.setQueryData(['queue-monitor', queueId], message.payload);
        queryClient.invalidateQueries({ queryKey: ['queue-tokens', queueId] });
      }
      if (message.type === 'queue_status') {
        queryClient.invalidateQueries({ queryKey: ['queue-monitor', queueId] });
      }
    },
    [queryClient, queueId],
  );

  const { connected } = useQueueSocket(queueId, tenantId, applySocketUpdate);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['queue-monitor', queueId] });
    queryClient.invalidateQueries({ queryKey: ['queue-tokens', queueId] });
  }, [queryClient, queueId]);

  const handleError = useCallback(
    (error) => {
      if (error?.code === 'concurrent_update' || error?.status === 409) {
        toast.info('Another operator got there first. Refreshed.');
        refresh();
        return;
      }
      toast.error(error?.message ?? 'That action did not go through.');
    },
    [toast, refresh],
  );

  const callNext = useMutation({
    mutationFn: () => queues.callNext(queueId),
    onSuccess: (token) => {
      toast.success(`Called ${token.token_number}`);
      refresh();
    },
    onError: (error) => {
      if (error?.code === 'queue_empty') {
        toast.info('Nobody is waiting.');
        return;
      }
      handleError(error);
    },
  });

  const tokenAction = useMutation({
    mutationFn: ({ tokenId, action }) => queues.tokenAction(tokenId, action),
    onSuccess: (_data, variables) => {
      const verbs = {
        complete: 'Completed', skip: 'Skipped', 'no-show': 'Marked no show',
        recall: 'Recalled', serve: 'Now serving', cancel: 'Cancelled',
        requeue: 'Back in the queue',
      };
      toast.success(verbs[variables.action] ?? 'Updated');
      refresh();
    },
    onError: handleError,
  });

  const lifecycle = useMutation({
    mutationFn: (action) => queues.lifecycle(queueId, action),
    onSuccess: (queue) => {
      toast.success(`Queue ${queue.status}`);
      refresh();
    },
    onError: handleError,
  });

  const walkIn = useMutation({
    mutationFn: (data) => queues.walkIn(queueId, data),
    onSuccess: (token) => {
      toast.success(`Issued token ${token.token_number}`);
      setWalkInOpen(false);
      refresh();
    },
    onError: handleError,
  });

  // Space calls the next person — the single most repeated action of the day.
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space') {
        event.preventDefault();
        callNext.mutate();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [callNext]);

  if (monitorQuery.isLoading) return <FullPageSpinner label="Opening the console" />;
  if (monitorQuery.isError) {
    return <ErrorState error={monitorQuery.error} onRetry={monitorQuery.refetch} />;
  }

  const monitor = monitorQuery.data;
  const current = monitor.current_token;
  const isOpen = monitor.status === 'open';
  const waitingTokens = (waitingQuery.data?.data ?? []).filter(
    (token) => token.status === 'waiting',
  );

  return (
    <div className="space-y-5">
      {/* Header: queue state and lifecycle controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Operator console</h1>
          <Badge tone={monitor.status} />
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted"
            title={connected ? 'Live updates connected' : 'Reconnecting — falling back to polling'}
          >
            {connected ? (
              <RadioTower className="h-3.5 w-3.5 text-jade" aria-hidden="true" />
            ) : (
              <Radio className="h-3.5 w-3.5 text-amber" aria-hidden="true" />
            )}
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setWalkInOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Walk-in token
          </Button>
          {isOpen ? (
            <Button
              variant="secondary" size="sm"
              onClick={() => lifecycle.mutate('pause')} loading={lifecycle.isPending}
            >
              <Pause className="h-4 w-4" aria-hidden="true" />
              Pause
            </Button>
          ) : (
            <Button
              variant="secondary" size="sm"
              onClick={() => lifecycle.mutate(monitor.status === 'paused' ? 'resume' : 'start')}
              loading={lifecycle.isPending}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {monitor.status === 'paused' ? 'Resume' : 'Start queue'}
            </Button>
          )}
        </div>
      </div>

      {/* The board and the one action that matters */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <CallBoard token={current} />

          <div className="flex flex-wrap gap-2">
            <Button
              size="xl"
              className="flex-1 min-w-[220px]"
              onClick={() => callNext.mutate()}
              loading={callNext.isPending}
              disabled={!isOpen}
            >
              <PhoneCall className="h-5 w-5" aria-hidden="true" />
              Call next
              <kbd className="ml-2 rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-normal">
                Space
              </kbd>
            </Button>

            {current && (
              <>
                <Button
                  variant="jade" size="xl"
                  onClick={() => tokenAction.mutate({ tokenId: current.id, action: 'complete' })}
                  loading={tokenAction.isPending}
                >
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  Complete
                </Button>
                <Button
                  variant="secondary" size="xl"
                  onClick={() => tokenAction.mutate({ tokenId: current.id, action: 'skip' })}
                >
                  <SkipForward className="h-5 w-5" aria-hidden="true" />
                  Skip
                </Button>
                <Button
                  variant="secondary" size="xl"
                  onClick={() => tokenAction.mutate({ tokenId: current.id, action: 'no-show' })}
                >
                  <UserX className="h-5 w-5" aria-hidden="true" />
                  No show
                </Button>
              </>
            )}
          </div>

          {!isOpen && (
            <p className="text-sm text-muted">
              This queue is {monitor.status}. Start it before issuing or calling tokens.
            </p>
          )}
        </div>

        <Card>
          <CardHeader
            title="Up next"
            description={`${monitor.waiting_count} waiting`}
          />
          <CardBody className="py-2">
            <UpNext tokens={waitingTokens.slice(0, 8)} />
          </CardBody>
        </Card>
      </div>

      {/* Live numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Waiting" value={monitor.waiting_count} tone="amber" />
        <Stat label="Completed" value={monitor.completed_count} tone="jade" />
        <Stat label="Skipped" value={monitor.skipped_count} tone="rose" />
        <Stat
          label="Avg wait"
          value={formatMinutes(monitor.average_wait_minutes)}
          hint="Join to call"
        />
        <Stat
          label="Est. wait"
          value={formatMinutes(monitor.estimated_wait_minutes)}
          hint="For someone joining now"
          tone="signal"
        />
      </div>

      {/* Full queue */}
      <Card>
        <CardHeader title="Today's tokens" />
        <Table
          rows={waitingQuery.data?.data ?? []}
          columns={[
            {
              key: 'token_number',
              header: 'Token',
              render: (row) => (
                <span className="font-mono font-bold tabular">{row.token_number}</span>
              ),
            },
            {
              key: 'customer_name',
              header: 'Customer',
              render: (row) => row.customer_name || <span className="text-muted">Walk-in</span>,
            },
            { key: 'status', header: 'Status', render: (row) => <Badge tone={row.status} /> },
            {
              key: 'created_at',
              header: 'Joined',
              render: (row) => (
                <span className="text-muted">{formatTime(row.created_at)}</span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) =>
                row.status === 'waiting' ? (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => tokenAction.mutate({ tokenId: row.id, action: 'cancel' })}
                  >
                    Cancel
                  </Button>
                ) : row.status === 'skipped' ? (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => tokenAction.mutate({ tokenId: row.id, action: 'requeue' })}
                  >
                    Requeue
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <WalkInDialog
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onSubmit={(data) => walkIn.mutate(data)}
        loading={walkIn.isPending}
      />
    </div>
  );
}

function WalkInDialog({ open, onClose, onSubmit, loading }) {
  const nameRef = useRef(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [priority, setPriority] = useState('normal');

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ customer_name: name.trim(), customer_phone: phone || null, priority });
    setName('');
    setPhone('');
    setPriority('normal');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Issue a walk-in token"
      description="For someone at the counter without a booking."
      initialFocusRef={nameRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!name.trim()}>
            Issue token
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer name" htmlFor="walkin-name" required>
          <Input
            id="walkin-name" ref={nameRef} value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Who is at the counter?"
          />
        </Field>
        <Field label="Phone" htmlFor="walkin-phone" hint="Optional">
          <Input
            id="walkin-phone" value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field label="Priority" htmlFor="walkin-priority">
          <Select
            id="walkin-priority" value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="priority">Priority — served before normal</option>
            <option value="emergency">Emergency — served first</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

WalkInDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  loading: PropTypes.bool,
};
