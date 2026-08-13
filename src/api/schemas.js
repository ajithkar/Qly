/**
 * Zod schemas — the type system at the API boundary.
 *
 * With no compile step, an unvalidated API response is the most likely source
 * of a runtime crash. Nothing from the network is used before it is parsed.
 */
import { z } from 'zod';

/** The backend's standard envelope: { data, meta }. */
export const envelope = (dataSchema) =>
  z.object({ data: dataSchema, meta: z.unknown().nullish() });

export const pageMeta = z.object({
  page: z.number(),
  page_size: z.number(),
  total: z.number(),
  total_pages: z.number(),
});

export const paginated = (itemSchema) =>
  z.object({ data: z.array(itemSchema), meta: pageMeta });

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).default([]),
  }),
});

// --- auth ---------------------------------------------------------------
export const tokenPair = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string().default('bearer'),
  expires_in: z.number(),
});

export const principal = z.object({
  id: z.string(),
  principal_type: z.enum(['user', 'staff', 'admin']),
  email: z.string().nullish(),
  name: z.string().nullish(),
  role: z.string().nullish(),
  tenant_id: z.string().nullish(),
  branch_id: z.string().nullish(),
  permissions: z.array(z.string()).default([]),
  status: z.string(),
  must_change_password: z.boolean().default(false),
});

// --- queue --------------------------------------------------------------
export const tokenStatus = z.enum([
  'waiting', 'called', 'serving', 'completed',
  'skipped', 'cancelled', 'transferred', 'no_show',
]);

export const queueToken = z.object({
  id: z.string(),
  queue_id: z.string(),
  token_number: z.string(),
  sequence: z.number(),
  status: tokenStatus,
  priority: z.enum(['normal', 'priority', 'emergency']).default('normal'),
  position: z.number().nullish(),
  people_ahead: z.number().nullish(),
  estimated_wait_minutes: z.number().nullish(),
  customer_name: z.string().nullish(),
  provider_id: z.string().nullish(),
  created_at: z.string().nullish(),
  called_at: z.string().nullish(),
});

export const liveMonitor = z.object({
  queue_id: z.string(),
  status: z.enum(['draft', 'open', 'paused', 'closed']),
  current_token: queueToken.nullish(),
  next_token: queueToken.nullish(),
  waiting_count: z.number(),
  serving_count: z.number(),
  completed_count: z.number(),
  skipped_count: z.number(),
  no_show_count: z.number(),
  average_wait_minutes: z.number(),
  average_service_minutes: z.number(),
  estimated_wait_minutes: z.number(),
  provider_status: z.array(z.record(z.unknown())).default([]),
  updated_at: z.string(),
});

export const queue = z.object({
  id: z.string(),
  name: z.string(),
  branch_id: z.string(),
  service_id: z.string(),
  provider_id: z.string().nullish(),
  status: z.enum(['draft', 'open', 'paused', 'closed']),
  business_day: z.string(),
  max_tokens: z.number().nullish(),
});

// --- catalog ------------------------------------------------------------
export const branch = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string().default('UTC'),
  phone: z.string().nullish(),
});

export const provider = z.object({
  id: z.string(),
  name: z.string(),
  branch_id: z.string(),
  title: z.string().nullish(),
  specialty: z.string().nullish(),
  experience_years: z.number().nullish(),
  consultation_fee: z.number().default(0),
  status: z.string().default('active'),
  photo_url: z.string().nullish(),
});

export const service = z.object({
  id: z.string(),
  name: z.string(),
  branch_id: z.string(),
  description: z.string().nullish(),
  duration_minutes: z.number(),
  buffer_minutes: z.number().default(0),
  price: z.number().default(0),
  payment_mode: z.enum(['prepaid_online', 'pay_at_venue']).default('pay_at_venue'),
  queue_capacity: z.number().default(100),
  token_prefix: z.string().nullish(),
});

// --- appointments -------------------------------------------------------
export const slot = z.object({
  start: z.string(),
  end: z.string(),
  available: z.boolean(),
});

export const slotsResponse = z.object({
  service_id: z.string(),
  provider_id: z.string(),
  date: z.string(),
  timezone: z.string(),
  slots: z.array(slot),
});

export const appointment = z.object({
  id: z.string(),
  branch_id: z.string(),
  service_id: z.string(),
  provider_id: z.string(),
  status: z.enum([
    'booked', 'confirmed', 'checked_in', 'completed',
    'cancelled', 'no_show', 'rejected',
  ]),
  payment_mode: z.string(),
  payment_status: z.string(),
  price: z.number().default(0),
  slot_start: z.string(),
  slot_end: z.string(),
  customer_name: z.string().nullish(),
});

// --- dashboard / admin --------------------------------------------------
export const adminDashboard = z.object({
  total_vendors: z.number(),
  active_vendors: z.number(),
  suspended_vendors: z.number(),
  paid_vendors: z.number(),
  free_vendors: z.number(),
  total_end_users: z.number(),
  todays_appointments: z.number(),
  active_queues: z.number(),
  tokens_issued_today: z.number(),
  mrr: z.number(),
  arr: z.number(),
  generated_at: z.string().nullish(),
});

export const adminVendor = z.object({
  id: z.string(),
  company_name: z.string().nullish(),
  slug: z.string().nullish(),
  owner_email: z.string().nullish(),
  owner_name: z.string().nullish(),
  business_type: z.string().nullish(),
  timezone: z.string().nullish(),
  currency: z.string().nullish(),
  status: z.string(),
  plan_code: z.string().nullish(),
  created_at: z.string().nullish(),
});

export const adminVendorDetail = z.object({
  organisation: adminVendor,
  subscription: z.record(z.unknown()).nullish(),
  counts: z.object({
    branches: z.number(),
    providers: z.number(),
    services: z.number(),
    staff: z.number(),
    appointments: z.number(),
  }),
});

export const adminUser = z.object({
  id: z.string(),
  email: z.string().nullish(),
  name: z.string().nullish(),
  picture: z.string().nullish(),
  status: z.string(),
  created_at: z.string().nullish(),
  last_login_at: z.string().nullish(),
});

export const plan = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  monthly_price: z.number(),
  yearly_price: z.number(),
  max_branches: z.number().nullish(),
  max_providers: z.number().nullish(),
  max_staff: z.number().nullish(),
  max_services: z.number().nullish(),
  monthly_tokens: z.number().nullish(),
  storage_mb: z.number().nullish(),
  reports_access: z.boolean().default(true),
  export_access: z.boolean().default(true),
  api_access: z.boolean().default(false),
  feature_flags: z.array(z.string()).default([]),
  is_trial: z.boolean().default(false),
  archived: z.boolean().default(false),
});

export const auditLog = z.object({
  id: z.string(),
  tenant_id: z.string().nullish(),
  actor_id: z.string().nullish(),
  actor_email: z.string().nullish(),
  action: z.string(),
  module: z.string(),
  resource_id: z.string().nullish(),
  ip_address: z.string().nullish(),
  created_at: z.string().nullish(),
});

export const stripeEvent = z.object({
  id: z.string(),
  event_id: z.string().nullish(),
  type: z.string().nullish(),
  processed: z.boolean().default(false),
  attempts: z.number().default(0),
  created_at: z.string().nullish(),
});

export const systemHealth = z.object({
  mongodb: z.string(),
  redis: z.string(),
  websocket_connections: z.number(),
  api_requests_total: z.number(),
  api_errors_total: z.number(),
  average_latency_ms: z.number(),
  uptime_seconds: z.number(),
  version: z.string(),
});

export const userProfile = z.object({
  id: z.string(),
  email: z.string().nullish(),
  name: z.string().nullish(),
  picture: z.string().nullish(),
  date_of_birth: z.string().nullish(),
  status: z.string(),
  created_at: z.string().nullish(),
  last_login_at: z.string().nullish(),
});

export const notificationPreferences = z.object({
  email_enabled: z.boolean().default(true),
  sms_enabled: z.boolean().default(false),
  quiet_hours: z.record(z.unknown()).nullish(),
});

export const notification = z.object({
  id: z.string(),
  event: z.string(),
  title: z.string(),
  body: z.string(),
  read: z.boolean().default(false),
  created_at: z.string(),
});

// --- leads ----------------------------------------------------------------
export const lead = z.object({
  id: z.string(),
  message: z.string(),
});

export const adminLead = z.object({
  id: z.string(),
  name: z.string(),
  organisation: z.string(),
  segment: z.enum(['clinic', 'hospital']),
  phone: z.string(),
  email: z.string(),
  department_count: z.string().nullish(),
  branch_count: z.string().nullish(),
  status: z.enum(['pending', 'verified', 'rejected']),
  tenant_id: z.string().nullish(),
  created_at: z.string().nullish(),
});
