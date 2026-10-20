import { NextResponse, type NextRequest } from 'next/server';

// Retain legacy code for rollback; expose only the current station by default.
export function proxy(request: NextRequest) {
  if (process.env.LEGACY_ENABLED === 'true') return NextResponse.next();
  const path = request.nextUrl.pathname;
  const exact = ['/help', '/start', '/updates', '/guides', '/faq', '/collections', '/official-link-unavailable', '/designs'];
  const prefixes = ['/update/', '/guide/', '/faq/', '/collection/', '/designs/'];
  let target = exact.includes(path) || prefixes.some(p => path.startsWith(p)) ? '/' : path === '/finder' ? '/search' : path === '/my-software' ? '/me' : '';
  if (['software', 'updates', 'guides', 'faqs', 'collections', 'categories'].some(p => path === `/admin/${p}` || path.startsWith(`/admin/${p}/`))) target = '/admin';
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone(); url.pathname = target; url.search = '';
  return NextResponse.redirect(url, 308);
}
export const config = { matcher: ['/help', '/start', '/finder', '/updates', '/update/:path*', '/guides', '/guide/:path*', '/faq/:path*', '/collections', '/collection/:path*', '/my-software', '/official-link-unavailable', '/designs/:path*', '/admin/software/:path*', '/admin/updates/:path*', '/admin/guides/:path*', '/admin/faqs/:path*', '/admin/collections/:path*', '/admin/categories/:path*'] };
