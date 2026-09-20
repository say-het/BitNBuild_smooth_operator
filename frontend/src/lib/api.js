const baseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export async function api(path, { method = 'GET', body } = {}) {
  const formData = body instanceof FormData;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined || formData ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : formData ? body : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? `API request failed (${response.status})`);
  return payload.data;
}

export async function loadOperationalSnapshot() {
  const [incidents, resources, hospitals, alerts, roadSnapshot] = await Promise.all([
    api('/incidents'), api('/resources'), api('/hospitals'), api('/alerts'), api('/geo/roads'),
  ]);
  return { incidents, resources, hospitals, alerts, roads: roadSnapshot.roads };
}

export function loadLiveContext() {
  return api('/geo/live-context?lat=23.0225&lng=72.5714&radius=12000');
}
