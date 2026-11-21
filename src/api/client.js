// Local Express API client — used when VITE_DATA_BACKEND=local.
// The browser only ever sees same-origin /api requests; the Vite dev
// server proxies /api → http://localhost:4000 (vite.config.js).
//
// Error shape: ApiError { status, message, details } — superset-friendly.

export const isLocalBackend = () => import.meta.env.VITE_DATA_BACKEND === 'local';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `HTTP ${res.status}`, data?.details);
  return data ?? {};
}

export const api = {
  auth: {
    // Register/login take a single object ({ email, password, displayName } /
    // { email, password }) — the shape AuthScreen calls them with.
    async register(creds) {
      return request('POST', '/auth/register', {
        email: creds.email,
        password: creds.password,
        displayName: creds.displayName,
      });
    },
    async login(creds) {
      return request('POST', '/auth/login', {
        email: creds.email,
        password: creds.password,
      });
    },
    async logout() {
      return request('POST', '/auth/logout');
    },
    async me() {
      const data = await request('GET', '/auth/me');
      return data?.user ?? null;
    },
  },
  transactions: {
    async get() {
      return request('GET', '/transactions');
    },
    async add(payload) {
      return request('POST', '/transactions', payload);
    },
    async update(id, changes) {
      return request('PUT', `/transactions/${encodeURIComponent(id)}`, changes);
    },
    async remove(id) {
      return request('DELETE', `/transactions/${encodeURIComponent(id)}`);
    },
  },
  budgets: {
    async get() {
      return request('GET', '/budgets');
    },
    async upsert(category, monthlyLimit) {
      return request('POST', '/budgets', { category, monthly_limit: monthlyLimit });
    },
    async remove(category) {
      return request('DELETE', `/budgets/${encodeURIComponent(category)}`);
    },
  },
  recurring: {
    async get() {
      return request('GET', '/recurring');
    },
    async add(payload) {
      return request('POST', '/recurring', payload);
    },
    async update(id, nextRunDate) {
      return request('PUT', `/recurring/${encodeURIComponent(id)}`, { nextRunDate });
    },
    async remove(id) {
      return request('DELETE', `/recurring/${encodeURIComponent(id)}`);
    },
  },
  profile: {
    async get() {
      return request('GET', '/profile');
    },
    async update(currency) {
      return request('PUT', '/profile', { currency });
    },
    async setProToggle(enabled) {
      return request('PUT', '/profile/is_pro', { enabled });
    },
  },
  notifications: {
    async get() {
      return request('GET', '/notifications');
    },
    async markRead(id) {
      return request('POST', `/notifications/read/${encodeURIComponent(id)}`);
    },
    async markAllRead() {
      return request('POST', '/notifications/read-all');
    },
  },
  parseCorrections: {
    async get() {
      return request('GET', '/parse_corrections');
    },
    async save(patternKey, correctedCategory) {
      return request('POST', '/parse_corrections', { pattern_key: patternKey, corrected_category: correctedCategory });
    },
  },
  assets: {
    async get() {
      return request('GET', '/assets');
    },
  },
  netWorth: {
    async get() {
      return request('GET', '/net_worth_history');
    },
  },
};
