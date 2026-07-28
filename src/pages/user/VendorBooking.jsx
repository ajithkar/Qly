import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, IndianRupee } from 'lucide-react';

import { discovery, me } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { PENDING_JOIN_KEY, signInWithGoogle } from '@/auth/pendingJoin';

/**
 * Vendor page: pick a branch (if there's more than one), pick a service,
 * then join that service's queue. Joining requires a signed-in end user -
 * an anonymous visitor is sent through Google sign-in first and dropped
 * back here to finish the same join once they return.
 */
export default function VendorBooking() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [joiningServiceId, setJoiningServiceId] = useState(null);

  const vendorQuery = useQuery({
    queryKey: ['vendor', tenantId],
    queryFn: () => discovery.vendor(tenantId),
  });

  const branchesQuery = useQuery({
    queryKey: ['vendor-branches', tenantId],
    queryFn: () => discovery.branches(tenantId),
  });

  useEffect(() => {
    if (!branchId && branchesQuery.data?.length) {
      setBranchId(branchesQuery.data[0].id);
    }
  }, [branchId, branchesQuery.data]);

  const servicesQuery = useQuery({
    queryKey: ['vendor-services', tenantId, branchId],
    queryFn: () => discovery.services(tenantId, branchId),
    enabled: Boolean(branchId),
  });

  const join = useMutation({
    mutationFn: (serviceId) => me.joinQueue(tenantId, { service_id: serviceId, branch_id: branchId }),
    onSuccess: (token) => navigate(`/track/${token.id}`),
    onError: (error) => {
      toast.error(error.message ?? 'Could not join that queue.');
      setJoiningServiceId(null);
    },
  });

  const handleJoin = (serviceId) => {
    if (!isAuthenticated) {
      localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ tenantId, branchId, serviceId }));
      signInWithGoogle(toast);
      return;
    }
    setJoiningServiceId(serviceId);
    join.mutate(serviceId);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/find" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Find a place
      </Link>

      {vendorQuery.isSuccess && (
        <div className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">{vendorQuery.data.company_name}</h1>
          <p className="mt-1 text-sm text-muted">{vendorQuery.data.business_type || 'Service provider'}</p>
        </div>
      )}
      {vendorQuery.isError && <ErrorState error={vendorQuery.error} onRetry={vendorQuery.refetch} />}

      {branchesQuery.isSuccess && branchesQuery.data.length > 1 && (
        <div className="mb-5 max-w-xs">
          <Select
            aria-label="Choose a branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            {branchesQuery.data.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
        </div>
      )}

      <Card>
        <CardHeader title="Choose a service" description="You'll get a token to track your place in line." />
        {(branchesQuery.isLoading || servicesQuery.isLoading) && <SkeletonRows />}
        {servicesQuery.isError && <ErrorState error={servicesQuery.error} onRetry={servicesQuery.refetch} />}
        {servicesQuery.isSuccess && servicesQuery.data.length === 0 && (
          <EmptyState title="No services listed" description="This branch has nothing bookable right now." />
        )}
        {servicesQuery.isSuccess && servicesQuery.data.length > 0 && (
          <div className="divide-y divide-line">
            {servicesQuery.data.map((service) => (
              <div key={service.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-medium">{service.name}</p>
                  {service.description && (
                    <p className="mt-0.5 text-sm text-muted">{service.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {service.duration_minutes} min
                    </span>
                    {service.price > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
                        {service.price}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  loading={join.isPending && joiningServiceId === service.id}
                  onClick={() => handleJoin(service.id)}
                >
                  Join queue
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
