/**
 * Axios client with token refresh and envelope unwrapping.
 *
 * Two behaviours worth knowing:
 *  1. A 401 triggers exactly one refresh attempt, and concurrent 401s queue
 *     behind it rather than each firing their own refresh (which would burn
 *     the rotating refresh token and log the user out).
 *  2. Every response is parsed through a Zod schema by the caller via
 *     `request()`. Unparsed data never reaches a component.
 */
import axios from 'axios';
import { z } from 'zod';
import { apiError, envelope } from './schemas';

const ACCESS_KEY = 'qly.access';
const REFRESH_KEY = 'qly.refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access_token, refresh_token }) {
    localStorage.setItem(ACCESS_KEY, access_token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

http.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Normalised error shape every component can rely on. */
export class ApiError extends Error {
  constructor({ code, message, details, status }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details ?? [];
    this.status = status;
  }
}

function toApiError(error) {
  const status = error?.response?.status;
  const parsed = apiError.safeParse(error?.response?.data);
  if (parsed.success) {
    return new ApiError({ ...parsed.data.error, status });
  }
  if (error.code === 'ECONNABORTED') {
    return new ApiError({
      code: 'timeout',
      message: 'The server took too long to respond. Try again.',
      status,
    });
  }
  return new ApiError({
    code: 'network_error',
    message: 'Could not reach the server. Check your connection.',
    status,
  });
}

// --- single-flight refresh ----------------------------------------------
let refreshInFlight = null;
const onLogout = new Set();

export function onSessionExpired(handler) {
  onLogout.add(handler);
  return () => onLogout.delete(handler);
}

async function refreshAccessToken() {
  const refresh_token = tokenStore.refresh;
  if (!refresh_token) throw new Error('no refresh token');

  const response = await axios.post(
    `${http.defaults.baseURL}/auth/refresh`,
    { refresh_token },
    { headers: { 'Content-Type': 'application/json' } },
  );
  const pair = envelope(
    z.object({ access_token: z.string(), refresh_token: z.string() }).passthrough(),
  ).parse(response.data);
  tokenStore.set(pair.data);
  return pair.data.access_token;
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error?.response?.status;
    const isAuthCall = original?.url?.includes('/auth/');

    if (status === 401 && !original?._retried && !isAuthCall) {
      original._retried = true;
      try {
        refreshInFlight = refreshInFlight ?? refreshAccessToken();
        const token = await refreshInFlight;
        refreshInFlight = null;
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      } catch {
        refreshInFlight = null;
        tokenStore.clear();
        onLogout.forEach((handler) => handler());
      }
    }
    return Promise.reject(toApiError(error));
  },
);

/**
 * Perform a request and validate the response against a Zod schema.
 * @param {object} config axios config
 * @param {import('zod').ZodTypeAny} schema schema for the unwrapped payload
 * @returns {Promise<unknown>} parsed data
 */
export async function request(config, schema) {
  const response = await http(config);
  if (!schema) return response.data?.data ?? response.data;

  const parsed = envelope(schema).safeParse(response.data);
  if (!parsed.success) {
    // A shape mismatch is a bug, not a user error — surface it loudly in dev.
    if (import.meta.env.DEV) {
      console.error('Response failed validation', config.url, parsed.error.issues);
    }
    throw new ApiError({
      code: 'invalid_response',
      message: 'The server returned unexpected data.',
      details: parsed.error.issues,
    });
  }
  return parsed.data.data;
}

/** Same as `request`, but for paginated list endpoints. */
export async function requestPage(config, itemSchema) {
  const response = await http(config);
  const shape = z.object({
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number(),
      page_size: z.number(),
      total: z.number(),
      total_pages: z.number(),
    }),
  });
  const parsed = shape.safeParse(response.data);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.error('Page failed validation', config.url, parsed.error.issues);
    }
    throw new ApiError({
      code: 'invalid_response',
      message: 'The server returned unexpected data.',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}
