import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/auth/AuthContext';
import { RequireAuth } from '@/auth/guards';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { ApiError } from '@/api/client';

import Landing from '@/pages/public/Landing';
import Login from '@/pages/public/Login';

const Register = lazy(() => import('@/pages/public/Register'));
const ForgotPassword = lazy(() => import('@/pages/public/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/public/ResetPassword'));

// Route-level code splitting: the operator console and its charts never load
// for someone who only wants to check their place in a queue.
const VendorLayout = lazy(() => import('@/components/layout/VendorLayout'));
const VendorDashboard = lazy(() => import('@/pages/vendor/Dashboard'));
const Queues = lazy(() => import('@/pages/vendor/Queues'));
const OperatorConsole = lazy(() => import('@/pages/vendor/OperatorConsole'));
const Services = lazy(() => import('@/pages/vendor/Services'));
const Providers = lazy(() => import('@/pages/vendor/Providers'));
const Branches = lazy(() => import('@/pages/vendor/Branches'));
const Appointments = lazy(() => import('@/pages/vendor/Appointments'));
const Billing = lazy(() => import('@/pages/vendor/Billing'));
const FindPlaces = lazy(() => import('@/pages/user/FindPlaces'));
const TrackToken = lazy(() => import('@/pages/user/TrackToken'));
const GoogleCallback = lazy(() => import('@/pages/user/GoogleCallback'));
const Profile = lazy(() => import('@/pages/user/Profile'));

// The Super Admin portal is its own world - a vendor or customer never pays
// for its bundle.
const AdminLogin = lazy(() => import('@/pages/admin/Login'));
const AdminLayout = lazy(() => import('@/components/layout/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminVendors = lazy(() => import('@/pages/admin/Vendors'));
const AdminVendorDetail = lazy(() => import('@/pages/admin/VendorDetail'));
const AdminPlans = lazy(() => import('@/pages/admin/Plans'));
const AdminUsers = lazy(() => import('@/pages/admin/Users'));
const AdminPayments = lazy(() => import('@/pages/admin/Payments'));
const AdminAuditLogs = lazy(() => import('@/pages/admin/AuditLogs'));
const AdminSystemHealth = lazy(() => import('@/pages/admin/SystemHealth'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 4xx just repeats the same rejection.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ErrorBoundary>
              <Suspense fallback={<FullPageSpinner />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/find" element={<FindPlaces />} />
                  <Route path="/track/:tokenId" element={<TrackToken />} />
                  <Route path="/auth/google/callback" element={<GoogleCallback />} />

                  <Route element={<RequireAuth principalType="user" />}>
                    <Route path="/profile" element={<Profile />} />
                  </Route>

                  <Route element={<RequireAuth principalType="staff" />}>
                    <Route path="/vendor" element={<VendorLayout />}>
                      <Route index element={<VendorDashboard />} />
                      <Route path="queues" element={<Queues />} />
                      <Route path="queues/:queueId/console" element={<OperatorConsole />} />
                      <Route path="appointments" element={<Appointments />} />
                      <Route path="services" element={<Services />} />
                      <Route path="providers" element={<Providers />} />
                      <Route path="branches" element={<Branches />} />
                      <Route path="billing" element={<Billing />} />
                    </Route>
                  </Route>

                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route element={<RequireAuth principalType="admin" />}>
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="vendors" element={<AdminVendors />} />
                      <Route path="vendors/:vendorId" element={<AdminVendorDetail />} />
                      <Route path="plans" element={<AdminPlans />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="payments" element={<AdminPayments />} />
                      <Route path="audit-logs" element={<AdminAuditLogs />} />
                      <Route path="system-health" element={<AdminSystemHealth />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
