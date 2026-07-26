import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Server, Zap } from 'lucide-react';

import { admin } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';

function uptime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function AdminSystemHealth() {
  const query = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: admin.systemHealth,
    refetchInterval: 30_000,
  });

  if (query.isLoading) return <FullPageSpinner label="Checking system health" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const h = query.data;
  const errorRate = h.api_requests_total > 0
    ? ((h.api_errors_total / h.api_requests_total) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">System health</h1>
        <p className="text-sm text-muted">
          Real metrics from this process - refreshes every 30 seconds.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardBody className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">MongoDB</p>
                <p className="text-xs text-muted">Primary datastore</p>
              </div>
            </div>
            <Badge tone={h.mongodb === 'healthy' ? 'open' : 'closed'}>{h.mongodb}</Badge>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-muted" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Redis</p>
                <p className="text-xs text-muted">Cache, rate limits, WS fan-out</p>
              </div>
            </div>
            <Badge tone={h.redis === 'healthy' ? 'open' : 'closed'}>{h.redis}</Badge>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="WebSocket connections" value={h.websocket_connections} />
        <Stat label="Requests served" value={h.api_requests_total.toLocaleString()} />
        <Stat
          label="Error rate"
          value={`${errorRate}%`}
          tone={Number(errorRate) > 1 ? 'rose' : 'jade'}
        />
        <Stat label="Avg latency" value={`${Math.round(h.average_latency_ms)}ms`} />
      </div>

      <Card>
        <CardHeader title="Process" />
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted">Version</p>
              <p className="text-sm font-medium">{h.version}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted">Uptime</p>
              <p className="text-sm font-medium">{uptime(h.uptime_seconds)}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
