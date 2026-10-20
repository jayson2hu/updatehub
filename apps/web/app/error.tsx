'use client';
import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <div className="sv-container sv-state" role="alert">
    <span className="sv-empty__icon" aria-hidden="true">😵</span>
    <h1>加载失败了</h1>
    <p>请检查网络后重试。</p>
    <div className="sv-u-row sv-u-center-row"><button type="button" className="sv-btn sv-btn--soft" onClick={reset}>重试</button><Link href="/" className="sv-btn sv-btn--ghost">回首页</Link></div>
  </div>;
}
