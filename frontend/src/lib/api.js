/**
 * API utilities - centralized API configuration and helpers
 */

const getApiBaseUrl = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  
  // Skip localhost:8080 (local dev backend that may not be running)
  if (envBase && !/localhost:8080|127\.0\.0\.1:8080/i.test(envBase)) {
    return envBase;
  }
  
  // Use current origin for Vercel deployments
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Fetch wrapper with error handling
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

/**
 * Market-specific API calls
 */
export const marketApi = {
  getParticipants: (marketId) => 
    apiFetch(`/api/markets/${marketId}/participants`),
  
  getTopHolders: (marketId) => 
    apiFetch(`/api/markets/${marketId}/top-holders`),
  
  getImage: (marketId) => 
    apiFetch(`/api/market-images?marketId=${marketId}`),
  
  saveImage: (marketId, imageUrl) => 
    apiFetch('/api/market-images', {
      method: 'POST',
      body: JSON.stringify({ marketId, imageUrl }),
    }),
};

/**
 * Pending markets API
 */
export const pendingMarketsApi = {
  getAll: () => apiFetch('/api/pending-markets'),
  
  getById: (id) => apiFetch(`/api/pending-markets/${id}`),
  
  create: (data) => 
    apiFetch('/api/pending-markets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  updateStatus: (id, status, extraData = {}) =>
    apiFetch(`/api/pending-markets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...extraData }),
    }),
};

/**
 * Activity API
 */
export const activityApi = {
  create: (data) =>
    apiFetch('/api/activity/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  getRecent: (limit = 20) =>
    apiFetch(`/api/activity?limit=${limit}`),
};

/**
 * Notifications API  
 */
export const notificationsApi = {
  getForUser: (address) =>
    apiFetch(`/api/notifications?recipient=${address}`),
  
  create: (data) =>
    apiFetch('/api/notifications', {
      method: 'POST', 
      body: JSON.stringify(data),
    }),
  
  markRead: (id) =>
    apiFetch(`/api/notifications`, {
      method: 'PATCH',
      body: JSON.stringify({ id, read: true }),
    }),
};


