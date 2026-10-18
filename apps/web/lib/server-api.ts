import 'server-only';
import { headers as requestHeaders } from 'next/headers';
import { api as requestApi } from './api';
export { ApiError, getSiteSettings } from './api';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  // Caddy replaces browser-supplied values. Web/API must remain private.
  // This avoids grouping all SSR visitors into the Web server's rate quota.
  const forwarded = (await requestHeaders()).get('x-forwarded-for');
  if (forwarded) headers.set('X-Forwarded-For', forwarded);
  return requestApi<T>(path, { ...options, headers });
}
