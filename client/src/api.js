export const OFFLINE_MESSAGE = 'Cannot perform this action because there is no internet connection.';
const SERVER_DOWN_MESSAGE = "Cannot perform this action because the app can't reach its server. Check your internet connection and try again.";

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function request(method, url, body) {
  if (isOffline()) throw new Error(OFFLINE_MESSAGE);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only throws when no response arrived at all.
    throw new Error(isOffline() ? OFFLINE_MESSAGE : SERVER_DOWN_MESSAGE);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A gateway error without our JSON error body means the server itself is unreachable.
    if (!data?.error && [502, 503, 504].includes(res.status)) throw new Error(SERVER_DOWN_MESSAGE);
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
