const apiOrigin = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000';
const safeReturnPath = /^\/(?:software|update)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const noCache = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

function unavailable(request: Request) {
  const target = new URL('/official-link-unavailable', request.url);
  try {
    const referer = new URL(request.headers.get('referer') || '');
    if (referer.origin === new URL(request.url).origin && safeReturnPath.test(referer.pathname)) {
      target.searchParams.set('from', referer.pathname);
    }
  } catch { /* A direct or privacy-protected visit has no return page. */ }
  return new Response(null, { status: 302, headers: { ...noCache, Location: target.pathname + target.search } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (new URL(request.url).search || !/^[a-zA-Z0-9-]+$/.test(id)) return unavailable(request);
  try {
    const headers = new Headers();
    // Match server-api: the private Web service receives this value from Caddy,
    // which replaces client-supplied headers at the public boundary.
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) headers.set('X-Forwarded-For', forwarded);
    // Only the trusted API can select the destination. Never follow its response
    // on the server or accept a visitor-supplied redirect URL.
    const response = await fetch(`${apiOrigin}/go/${encodeURIComponent(id)}`, {
      redirect: 'manual', cache: 'no-store', headers, signal: AbortSignal.timeout(12000),
    });
    const location = response.headers.get('location');
    if (response.status === 302 && location) {
      const destination = new URL(location);
      if (destination.protocol === 'https:' && !destination.username && !destination.password) {
        return new Response(null, { status: 302, headers: { ...noCache, Location: destination.href } });
      }
    }
  } catch { /* A timeout or invalid destination uses the same recoverable page. */ }
  return unavailable(request);
}
