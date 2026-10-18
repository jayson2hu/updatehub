'use client';
import { StationLink as Link, DesignProvider } from './design-context';
import { usePathname } from 'next/navigation';
import { Bell, Grid2X2, RefreshCw, ShieldCheck, ArrowUpRight, LockKeyhole } from 'lucide-react';
import type { Settings } from '@/lib/station-types';
import { BrandMark } from './common';
import { designFromPath } from '@/lib/design-options';

export function StationChrome({ children, settings }: { children: React.ReactNode; settings: Settings }) {
  const path = usePathname();
  if (path.startsWith('/admin') || path === '/designs' || path.startsWith('/designs/')) return <>{children}</>;
  const design = designFromPath(path);
  const stationPath = design ? path.slice(`/designs/${design}`.length) || '/' : path;
  const items = [{ href: '/', text: '最新', icon: RefreshCw }, { href: '/software', text: '软件', icon: Grid2X2 }, { href: '/announcements', text: '公告', icon: Bell }];
  const detail = /^\/software\/.+/.test(stationPath);
  const active = (href: string) => href === '/' ? stationPath === '/' : stationPath.startsWith(href);
  return <DesignProvider variant={design}><div className={`st-site${detail ? ' st-is-detail' : ''}${design ? ` st-theme-${design}` : ''}`}>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="st-header"><div className="st-header-inner">
      <Link href="/" className="st-brand" aria-label={`${settings.site_name}首页`}><span className="st-brand-icon"><BrandMark/></span><span>{settings.site_name}</span></Link>
      <span className="st-brand-description">软件更新与群公告</span>
      <nav className="st-desktop-nav" aria-label="主导航">{items.map(({ href, text, icon: Icon }) => <Link key={href} className={active(href) ? 'st-nav-active' : ''} href={href} aria-current={active(href) ? 'page' : undefined}><Icon size={18}/>{text}</Link>)}</nav>
      <Link className="st-header-admin" href="/admin"><LockKeyhole size={16}/>管理入口</Link>
      <Link className="st-header-mobile-link" href="/software">软件目录<ArrowUpRight size={16}/></Link>
    </div></header>
    <Link href="/designs" className="st-design-lab-entry">50 套全新界面设计已开放，进入挑选与对比<ArrowUpRight size={16}/></Link>
    <main id="main-content" className="st-main">{children}</main>
    <footer className="st-footer"><div className="st-footer-brand"><span className="st-brand-icon"><BrandMark/></span><div><strong>{settings.site_name}</strong><span>{settings.site_description}</span></div></div><div className="st-footer-links"><span><ShieldCheck size={15}/>获取入口由管理员维护</span><Link href="/admin">管理后台<ArrowUpRight size={14}/></Link></div></footer>
    <nav className="st-bottom-nav" aria-label="手机导航">{items.map(({ href, text, icon: Icon }) => <Link key={href} className={active(href) ? 'st-nav-active' : ''} href={href} aria-current={active(href) ? 'page' : undefined}><span><Icon size={21}/></span><span>{text}</span></Link>)}</nav>
  </div></DesignProvider>;
}
