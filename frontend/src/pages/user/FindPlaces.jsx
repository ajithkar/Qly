import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, MapPin, Search, Store, User as UserIcon,
} from 'lucide-react';

import { discovery } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { signInWithGoogle } from '@/auth/pendingJoin';
import { BackLink } from '@/components/ui/BackLink';
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
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <BackLink to="/" label="Back to home" className="mb-4" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              Find a clinic near you
            </h1>
            <p className="mt-1.5 max-w-md text-base leading-[1.65] text-secondary">
              Search for your clinic, join the queue, and track your turn from your phone.
            </p>
          </div>
          {!loading && (
            isAuthenticated && principal.principal_type === 'user' ? (
              <Link to="/profile" className="sm:shrink-0">
                <Button variant="secondary" size="md" className="min-h-11 w-full justify-center whitespace-nowrap sm:w-auto">
                  <UserIcon className="h-4 w-4" aria-hidden="true" />
                  {principal.name ?? 'My profile'}
                </Button>
              </Link>
            ) : (
              <Button
                variant="secondary" size="md" onClick={() => signInWithGoogle(toast)}
                className="min-h-11 w-full justify-center whitespace-nowrap sm:w-auto sm:shrink-0"
              >
                Sign in with Google
              </Button>
            )
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              className="min-h-11 pl-11 text-base"
              placeholder="Search by clinic name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search clinics"
            />
          </div>
          <Button
            variant="secondary" onClick={useMyLocation}
            className="min-h-11 justify-center text-base sm:w-auto"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Near me
          </Button>
        </div>

        <div className="mt-6">
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
                  <Card className="min-h-[76px] transition hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-elevated">
                    <CardBody className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal/8 text-signal">
                        <Store className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-semibold text-ink">{vendor.company_name}</h2>
                        <p className="mt-0.5 text-sm text-secondary">
                          {vendor.business_type || 'Service provider'}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
