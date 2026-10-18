import type { Metadata } from 'next';
import Link from 'next/link';
import { Link2Off } from 'lucide-react';

export const metadata: Metadata = { title: '官方入口暂时无法打开', robots: { index: false, follow: false } };

export default async function OfficialLinkUnavailable({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const returnPath = typeof from === 'string' && /^\/(?:software|update)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(from) ? from : '/';
  return <section className="page-container empty-state not-found">
    <Link2Off size={46} />
    <h1>官方入口暂时无法打开</h1>
    <p>这个入口可能已停用，或当前服务暂时无法核对地址。<br />你可以返回刚才的内容，选择其他官方入口，或稍后重试。</p>
    <div className="button-row">
      <Link href={returnPath} className="button button-primary">{returnPath === '/' ? '返回公告中心' : '返回刚才的页面'}</Link>
      <Link href="/software" className="button button-secondary">查找其他软件</Link>
    </div>
  </section>;
}
