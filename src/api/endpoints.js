/**
 * Every network call the app makes, in one place.
 * Components never build a URL or call axios directly.
 */
import { z } from 'zod';
import { request, requestPage } from './client';
import * as s from './schemas';

// --- auth ---------------------------------------------------------------
export const auth = {
  login: (body) =>
    request({ url: '/auth/login', method: 'POST', data: body }, s.tokenPair),
  registerVendor: (body) =>
    request({ url: '/auth/register-vendor', method: 'POST', data: body },
      z.object({ tenant_id: z.string(), message: z.string() })),
  me: () => request({ url: '/auth/me' }, s.principal),
  logout: (refresh_token) =>
    request({ url: '/auth/logout', method: 'POST', data: { refresh_token } },
      z.object({ logged_out: z.boolean() })),
  forgotPassword: (email) =>
    request({ url: '/auth/forgot-password', method: 'POST', data: { email } },
      z.object({ message: z.string() })),
  resetPassword: (body) =>
    request({ url: '/auth/reset-password', method: 'POST', data: body },
      z.object({ reset: z.boolean() })),
  googleLoginUrl: () =>
    request({ url: '/auth/google/login' },
      z.object({ authorization_url: z.string(), state: z.string() })),
  googleCallback: (body) =>
    request({ url: '/auth/google/callback', method: 'POST', data: body },
      s.tokenPair.extend({ user: z.object({ id: z.string(), name: z.string().nullish() }) })),
  adminLogin: (body) =>
    request({ url: '/admin/auth/login', method: 'POST', data: body }, s.tokenPair),
  /** Redeems a shared Operator Console one-time code. */
  consoleAccess: (body) =>
    request({ url: '/auth/console-access', method: 'POST', data: body }, s.tokenPair),
};

// --- vendor catalog -----------------------------------------------------
export const branches = {
  list: (params) => requestPage({ url: '/vendor/branches', params }, s.branch),
  create: (data) => request({ url: '/vendor/branches', method: 'POST', data }, s.branch),
  update: (id, data) => request({ url: `/vendor/branches/${id}`, method: 'PATCH', data }, s.branch),
  remove: (id) => request({ url: `/vendor/branches/${id}`, method: 'DELETE' },
    z.object({ deleted: z.boolean() })),
};

export const providers = {
  list: (params) => requestPage({ url: '/vendor/providers', params }, s.provider),
  create: (data) => request({ url: '/vendor/providers', method: 'POST', data }, s.provider),
  update: (id, data) => request({ url: `/vendor/providers/${id}`, method: 'PATCH', data }, s.provider),
  remove: (id) => request({ url: `/vendor/providers/${id}`, method: 'DELETE' },
    z.object({ deleted: z.boolean() })),
};

export const services = {
  list: (params) => requestPage({ url: '/vendor/services', params }, s.service),
  create: (data) => request({ url: '/vendor/services', method: 'POST', data }, s.service),
  update: (id, data) => request({ url: `/vendor/services/${id}`, method: 'PATCH', data }, s.service),
  remove: (id) => request({ url: `/vendor/services/${id}`, method: 'DELETE' },
    z.object({ deleted: z.boolean() })),
};

// --- queues -------------------------------------------------------------
export const queues = {
  list: (params) => requestPage({ url: '/vendor/queues', params }, s.queue),
  get: (id) => request({ url: `/vendor/queues/${id}` }, s.queue),
  create: (data) => request({ url: '/vendor/queues', method: 'POST', data }, s.queue),
  monitor: (id) => request({ url: `/vendor/queues/${id}/monitor` }, s.liveMonitor),
  tokens: (id, params) =>
    requestPage({ url: `/vendor/queues/${id}/tokens`, params }, s.queueToken),
  /** action: start | pause | resume | close. `data.provider_id` assigns the
   * doctor for `start` - only that doctor (or an owner/manager) can then use
   * the queue's Operator Console. */
  lifecycle: (id, action, data) =>
    request({ url: `/vendor/queues/${id}/${action}`, method: 'POST', data }, s.queue),
  callNext: (id) =>
    request({ url: `/vendor/queues/${id}/call-next`, method: 'POST' }, s.queueToken),
  walkIn: (id, data) =>
    request({ url: `/vendor/queues/${id}/tokens/walk-in`, method: 'POST', data }, s.queueToken),
  /** action: recall | serve | complete | skip | no-show | cancel | requeue */
  tokenAction: (tokenId, action) =>
    request({ url: `/vendor/queues/tokens/${tokenId}/${action}`, method: 'POST' }, s.queueToken),
  transfer: (tokenId, target_queue_id) =>
    request({
      url: `/vendor/queues/tokens/${tokenId}/transfer`,
      method: 'POST',
      data: { target_queue_id },
    }, s.queueToken),
  /** One-time code + link for the assigned doctor to open this console. */
  shareConsole: (id) =>
    request({ url: `/vendor/queues/${id}/console/share`, method: 'POST' },
      z.object({
        queue_id: z.string(),
        queue_name: z.string(),
        doctor_name: z.string(),
        code: z.string(),
        expires_at: z.string(),
      })),
};

// --- appointments -------------------------------------------------------
export const appointments = {
  list: (params) => requestPage({ url: '/vendor/appointments', params }, s.appointment),
  create: (data) => request({ url: '/vendor/appointments', method: 'POST', data }, s.appointment),
  slots: (serviceId, params) =>
    request({ url: `/services/${serviceId}/slots`, params }, s.slotsResponse),
  changeStatus: (id, data) =>
    request({ url: `/vendor/appointments/${id}/status`, method: 'PATCH', data }, s.appointment),
  checkIn: (id) =>
    request({ url: `/vendor/appointments/${id}/check-in`, method: 'POST' }, s.queueToken),
  mine: (params) => requestPage({ url: '/me/appointments', params }, s.appointment),
  book: (data) => request({ url: '/appointments', method: 'POST', data }, s.appointment),
  cancelMine: (id) =>
    request({ url: `/me/appointments/${id}/cancel`, method: 'POST' }, s.appointment),
};

// --- end user -----------------------------------------------------------
const vendorProfile = z.object({
  id: z.string(),
  company_name: z.string().nullish(),
  slug: z.string().nullish(),
  business_type: z.string().nullish(),
  logo_url: z.string().nullish(),
});

export const discovery = {
  vendors: (params) => requestPage({ url: '/vendors', params }, vendorProfile),
  vendor: (tenantId) => request({ url: `/vendors/${tenantId}` }, vendorProfile),
  branches: (tenantId) =>
    request({ url: `/vendors/${tenantId}/branches` },
      z.array(z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string().nullish(),
        address: z.object({
          line1: z.string().nullish(),
          city: z.string().nullish(),
        }).nullish(),
      }))),
  services: (tenantId, branch_id) =>
    request({ url: `/vendors/${tenantId}/services`, params: { branch_id } },
      z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullish(),
        duration_minutes: z.number(),
        price: z.number(),
        payment_mode: z.string(),
      }))),
};

export const me = {
  joinQueue: (tenantId, data) =>
    request({ url: '/queues/join', method: 'POST', data, params: { tenant_id: tenantId } },
      s.queueToken),
  token: (tokenId) => request({ url: `/me/tokens/${tokenId}` }, s.queueToken),
  notifications: (params) => requestPage({ url: '/me/notifications', params }, s.notification),
  markRead: (id) =>
    request({ url: `/me/notifications/${id}/read`, method: 'POST' },
      z.object({ updated: z.boolean() })),
  profile: () => request({ url: '/me/profile' }, s.userProfile),
  updateProfile: (data) =>
    request({ url: '/me/profile', method: 'PATCH', data },
      z.object({ id: z.string(), name: z.string().nullish(), date_of_birth: z.string().nullish() })),
  preferences: () => request({ url: '/me/preferences' }, s.notificationPreferences),
  updatePreferences: (data) =>
    request({ url: '/me/preferences', method: 'PATCH', data }, z.object({ updated: z.boolean() })),
  exportData: () => request({ url: '/me/export', method: 'POST' }, z.record(z.unknown())),
  requestDeletion: () =>
    request({ url: '/me/delete-request', method: 'POST' },
      z.object({ deletion_requested: z.boolean(), message: z.string() })),
};

export const publicQueue = {
  status: (queueId, tenant_id) =>
    request({ url: `/queues/${queueId}/status`, params: { tenant_id } },
      s.liveMonitor.partial({ current_token: true, next_token: true })),
};

// --- billing ------------------------------------------------------------
export const billing = {
  subscription: () =>
    request({ url: '/vendor/subscription' },
      z.object({
        subscription: z.record(z.unknown()).nullish(),
        plan: z.record(z.unknown()).nullish(),
        tenant_status: z.string().nullish(),
      })),
  checkout: (data) =>
    request({ url: '/vendor/checkout', method: 'POST', data },
      z.object({ checkout_url: z.string(), session_id: z.string() })),
};

// --- admin ----------------------------------------------------------------
export const admin = {
  dashboard: () => request({ url: '/admin/dashboard' }, s.adminDashboard),

  vendors: (params) => requestPage({ url: '/admin/vendors', params }, s.adminVendor),
  vendor: (id) => request({ url: `/admin/vendors/${id}` }, s.adminVendorDetail),
  /** Vendor stays 'pending' until they pay via the returned checkout_url. */
  createVendor: (data) =>
    request({ url: '/admin/vendors', method: 'POST', data },
      s.adminVendor.extend({ checkout_url: z.string(), checkout_session_id: z.string() })),
  /** A fresh payment link, in case the first one expired unused. */
  vendorCheckout: (id) =>
    request({ url: `/admin/vendors/${id}/checkout`, method: 'POST' },
      z.object({ checkout_url: z.string(), checkout_session_id: z.string() })),
  /** Only populated for a short window after the vendor's payment activates them. */
  vendorCredentials: (id) =>
    request({ url: `/admin/vendors/${id}/credentials` },
      z.object({ email: z.string(), password: z.string() })),
  suspendVendor: (id) =>
    request({ url: `/admin/vendors/${id}/suspend`, method: 'POST' }, s.adminVendor),
  reactivateVendor: (id) =>
    request({ url: `/admin/vendors/${id}/reactivate`, method: 'POST' }, s.adminVendor),
  impersonateVendor: (id) =>
    request({ url: `/admin/vendors/${id}/impersonate`, method: 'POST' },
      z.object({
        access_token: z.string(),
        impersonated: z.boolean(),
        tenant_id: z.string(),
        expires_in: z.number(),
        notice: z.string().nullish(),
      })),

  plans: (params) => requestPage({ url: '/admin/plans', params }, s.plan),
  createPlan: (data) => request({ url: '/admin/plans', method: 'POST', data }, s.plan),
  updatePlan: (id, data) => request({ url: `/admin/plans/${id}`, method: 'PATCH', data }, s.plan),

  users: (params) => requestPage({ url: '/admin/users', params }, s.adminUser),
  suspendUser: (id) =>
    request({ url: `/admin/users/${id}/suspend`, method: 'POST' }, s.adminUser),

  auditLogs: (params) => requestPage({ url: '/admin/audit-logs', params }, s.auditLog),
  stripeEvents: (params) => requestPage({ url: '/admin/stripe-events', params }, s.stripeEvent),
  systemHealth: () => request({ url: '/admin/system-health' }, s.systemHealth),
};
