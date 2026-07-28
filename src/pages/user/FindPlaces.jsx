import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search, Store, User as UserIcon } from 'lucide-react';

import { discovery } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { signInWithGoogle } from '@/auth/pendingJoin';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

/** Discovery for end users. Geolocation is opt-in, never requested on load. */
export default function FindPlaces() {
  const { isAuthenticated, principal, loading } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState(null);

  const query = useQuery({
    queryKey: ['discover', { search, coords }],
    queryFn: () =>
      discovery.vendors({
        page: 1,
        page_size: 24,
        ...(search ? { search } : {}),
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      }),
  });

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (position) =>
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => setCoords(null),
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Find a place</h1>
          <p className="mt-1 text-sm text-muted">
            Join a queue or book a time without calling ahead.
          </p>
        </div>
        {!loading && (
          isAuthenticated && principal.principal_type === 'user' ? (
            <Link to="/profile">
              <Button variant="secondary" size="sm">
                <UserIcon className="h-4 w-4" aria-hidden="true" />
                {principal.name ?? 'My profile'}
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => signInWithGoogle(toast)}>
              Sign in with Google
            </Button>
          )
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search places"
          />
        </div>
        <Button variant="secondary" onClick={useMyLocation}>
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Near me
        </Button>
      </div>

      <div className="mt-5">
        {query.isLoading && <SkeletonRows rows={4} columns={2} />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.isSuccess && (
          <div className="grid gap-3 sm:grid-cols-2">
            {query.data.data.length === 0 && (
              <div className="sm:col-span-2">
                <EmptyState
                  icon={Store}
                  title="Nothing matched"
                  description="Try a different name, or search near your location."
                />
              </div>
            )}
            {query.data.data.map((vendor) => (
              <Link key={vendor.id} to={`/vendors/${vendor.id}`}>
                <Card className="transition-colors hover:border-signal/40">
                  <CardBody>
                    <h2 className="text-sm font-semibold">{vendor.company_name}</h2>
                    <p className="mt-0.5 text-sm text-muted">
                      {vendor.business_type || 'Service provider'}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
