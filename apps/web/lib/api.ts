import type { SiteSettings } from './types';
let csrfToken: string | null = null;
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isServer = typeof window === 'undefined';
  const base = isServer ? `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000'}/api/v1` : '/api/v1';
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const mutate = options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase());
  // Anonymous station writes (feedback, wishes, sync codes, events) carry no session.
  if (!isServer && mutate && path !== '/admin/auth/login' && !path.startsWith('/station/')) {
    if (!csrfToken) {
      const session = await api<{ csrf_token: string }>('/admin/auth/me');
      csrfToken = session.csrf_token;
    }
    headers.set('X-CSRF-Token', csrfToken);
  }
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers, credentials: 'include', cache: 'no-store', signal: options.signal || AbortSignal.timeout(12000) });
  } catch { throw new ApiError(0, '暂时无法连接服务，请稍后重试。'); }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) csrfToken = null;
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((e: { loc?: string[]; msg: string }) => `${e.loc?.slice(1).join('.') || '字段'}：${e.msg}`).join('；') : '操作未完成，请重试。';
    throw new ApiError(response.status, message);
  }
  if (body?.csrf_token) csrfToken = body.csrf_token;
  if (path === '/admin/auth/logout') csrfToken = null;
  return body as T;
}
export async function getSiteSettings(): Promise<SiteSettings> {
  try { return await api<SiteSettings>('/settings'); }
  catch { return { site_name: process.env.SITE_NAME || 'UpdateHub', site_description: '软件公告中心 · 变化、影响与行动建议' }; }
}
