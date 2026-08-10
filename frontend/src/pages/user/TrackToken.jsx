import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { me } from '@/api/endpoints';
import { CallBoard } from '@/components/CallBoard';
import { BackLink } from '@/components/ui/BackLink';
import { Card, CardBody } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { formatMinutes } from '@/lib/cn';

/**
 * What a customer sees while waiting. Their own token gets the board
 * treatment because it is the one thing they came to check.
 */
export default function TrackToken() {
  const { tokenId } = useParams();

  const query = useQuery({
    queryKey: ['my-token', tokenId],
    queryFn: () => me.token(tokenId),
    refetchInterval: 10000,
  });

  if (query.isLoading) return <FullPageSpinner label="Finding your token" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const token = query.data;
  const waiting = token.status === 'waiting';

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <BackLink to="/find" label="Find a place" className="mb-4" />
      <CallBoard token={token} label="Your token" />

      <Card className="mt-4">
        <CardBody className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Position</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular">
              {waiting ? token.position : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Ahead</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular">
              {waiting ? token.people_ahead : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Wait</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular text-signal">
              {waiting ? formatMinutes(token.estimated_wait_minutes) : '—'}
            </p>
          </div>
        </CardBody>
      </Card>

      <p className="mt-4 text-center text-sm text-muted">
        {token.status === 'called'
          ? 'You are being called. Head to the counter.'
          : token.status === 'completed'
            ? 'All done. Thanks for waiting.'
            : waiting
              ? 'We will let you know when it is your turn.'
              : `This token is ${token.status}.`}
      </p>
    </div>
  );
}
