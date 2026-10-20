import Link from 'next/link';

export default function NotFound() {
  return <div className="sv-container sv-state">
    <span className="sv-empty__icon" aria-hidden="true">🔍</span>
    <h1>这个页面不存在</h1>
    <p>链接可能有误，或者软件已下架、公告已经撤回。</p>
    <Link href="/" className="sv-btn sv-btn--primary">回首页</Link>
  </div>;
}
