export async function api<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    // Never serve stale data from the browser/Next cache. Reads (prep
    // suggestions, inventory, recipes, counts...) must always reflect the
    // current database state, so we disable caching on every request.
    cache: "no-store",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
