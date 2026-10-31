'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Settings } from '@/lib/station-types';
import type { InApp } from '@/lib/station-view';
import { useNewFavorites } from '@/hooks/use-station-local';
import { Badge, StationUiProvider, useStationUi } from './ui';
import { ThemeToggle } from './theme';
import { CatMark } from './cat';

type Route = 'home' | 'library' | 'detail' | 'announcements' | 'announcement' | 'search' | 'me' | 'about' | 'other';
function routeOf(path: string): Route {
  if (path === '/') return 'home';
  if (path === '/software') return 'library';
  if (path.startsWith('/software/')) return 'detail';
  if (path === '/announcements') return 'announcements';
  if (path.startsWith('/announcements/')) return 'announcement';
  if (path === '/search') return 'search';
  if (path === '/me') return 'me';
  if (path === '/about') return 'about';
  return 'other';
}

// 记录本次会话是否发生过站内跳转：没有上一页（直接从分享链接进入）时「‹」回首页（R-GLOBAL-02）。
let navigatedInside = false;
export function useBack() {
  const router = useRouter();
  return () => { if (navigatedInside && window.history.length > 1) router.back(); else router.push('/'); };
}

export function StationChrome({ children, settings, inApp, latest, summary }: { children: ReactNode; settings: Settings; inApp: InApp; latest: Record<string, string>; summary: { today: number; hold: number } }) {
  const path = usePathname() || '/';
  const [firstPath] = useState(path);
  useEffect(() => { if (path !== firstPath) navigatedInside = true; }, [path, firstPath]);
  // 后台和设计稿实验室不套前台外壳。
  if (path.startsWith('/admin') || path === '/designs' || path.startsWith('/designs/')) return <>{children}</>;
  const route = routeOf(path);
  // 弹层和 toast 由 StationUiProvider 渲染，必须放在 .sv-site 里面才能用到 v4 样式。
  return <div className="sv-site" data-route={route}><StationUiProvider settings={settings} inApp={inApp} latest={latest}>
      <a className="sv-skip" href="#sv-main">跳到主要内容</a>
      <DesktopNav route={route} settings={settings} latest={latest}/>
      <RouteTopbar route={route} settings={settings} latest={latest} summary={summary}/>
      {route === 'home' && <InAppBar/>}
      <main id="sv-main" className="sv-main" tabIndex={-1}>{children}</main>
      <Footer settings={settings}/>
      {route !== 'search' && <TabBar route={route} latest={latest}/>}
  </StationUiProvider></div>;
}

/* ---------- 电脑顶部导航（R-GLOBAL-03） ---------- */
function DesktopNav({ route, settings, latest }: { route: Route; settings: Settings; latest: Record<string, string> }) {
  const router = useRouter();
  const count = useNewFavorites(latest).length;
  const [query, setQuery] = useState('');
  const composing = useRef(false);
  function search(value: string) {
    if (!value.trim() || composing.current) return;
    router.push(`/search?q=${encodeURIComponent(value)}`);
    setQuery('');
  }
  const items: [string, string, boolean][] = [
    ['/', '首页', route === 'home'], ['/software', '软件库', route === 'library' || route === 'detail'],
    ['/announcements', '群公告', route === 'announcements' || route === 'announcement'], ['/me', '我的收藏', route === 'me'],
  ];
  return <header className="sv-nav"><div className="sv-nav__in">
    <Link href="/" className="sv-nav__brand" aria-label={`${settings.site_name}首页`}><Logo settings={settings}/><span className="sv-brand">{settings.site_name}</span></Link>
    <nav aria-label="主导航" className="sv-nav__links">{items.map(([href, text, on]) => <Link key={href} href={href} className={on ? 'is-on' : ''} aria-current={on ? 'page' : undefined}>{text}{href === '/me' && <Badge count={count}/>}</Link>)}</nav>
    {route !== 'search' && <form className="sv-search sv-nav__search" role="search" onSubmit={e => { e.preventDefault(); search(query); }}>
      <span aria-hidden="true">🔍</span>
      {/* 中文候选字确认后再跳页，避免拼音输入被导航打断。 */}
      <input type="search" value={query} placeholder="搜软件名或用途" aria-label="搜索软件" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={e => { composing.current = false; search(e.currentTarget.value); }} onChange={e => { const value = e.target.value; setQuery(value); search(value); }}/>
    </form>}
    <ThemeToggle/>
  </div></header>;
}

export function Logo({ settings }: { settings: Settings }) {
  // 管理员另设了文字标志时沿用文字；默认（空或“喵”）显示猫咪吉祥物。
  const text = settings.logo_text?.trim();
  if (text && text !== '喵') return <span className="sv-logo" aria-hidden="true">{text}</span>;
  return <span className="sv-logo sv-logo--cat" aria-hidden="true"><CatMark size={36}/></span>;
}

/* ---------- 手机顶栏（R-GLOBAL-02）；详情页、搜索页由页面自己渲染 ---------- */
export function MobileTopbar({ children, back = false }: { children?: ReactNode; back?: boolean }) {
  const goBack = useBack();
  return <div className="sv-topbar">
    {back && <button type="button" className="sv-ib sv-ib--back" aria-label="返回" onClick={goBack}>‹</button>}
    {children}
  </div>;
}

function RouteTopbar({ route, settings, latest, summary }: { route: Route; settings: Settings; latest: Record<string, string>; summary: { today: number; hold: number } }) {
  const { copy } = useStationUi();
  const count = useNewFavorites(latest).length;
  if (route === 'detail' || route === 'search') return null;
  if (route === 'library') return <MobileTopbar><h1 className="sv-topbar__title">软件库</h1><Link className="sv-ib" href="/search" aria-label="搜索">🔍</Link><ThemeToggle/></MobileTopbar>;
  if (route === 'announcements') return <MobileTopbar><h1 className="sv-topbar__title">群公告</h1><ThemeToggle/></MobileTopbar>;
  if (route === 'me') return <MobileTopbar><h1 className="sv-topbar__title">我的</h1><ThemeToggle/></MobileTopbar>;
  if (route === 'about') return <MobileTopbar back><span className="sv-topbar__title">关于本站</span></MobileTopbar>;
  if (route === 'announcement') return <MobileTopbar back><span className="sv-topbar__title">公告详情</span><button type="button" className="sv-ib" aria-label="复制公告链接" onClick={() => copy(window.location.href, '公告链接已复制')}>↗</button></MobileTopbar>;
  return <MobileTopbar>
    <Link href="/" className="sv-topbar__brand" aria-label={`${settings.site_name}首页`}><Logo settings={settings}/><span className="sv7-brand"><span className="sv-brand">{settings.site_name}</span><span className="sv7-brand__sub">{summary.today ? `今天有 ${summary.today} 个更新${summary.hold ? `，${summary.hold} 个要小心喵` : ''}` : '群友整理的软件更新'}</span></span></Link>
    <Link className="sv-ib" href="/search" aria-label="搜索">🔍</Link>
    <ThemeToggle/>
    <Link className="sv-ib" href="/me" aria-label={count ? `我的收藏，${count} 个有新版` : '我的收藏'}>⭐{count > 0 && <span className="sv-dot sv-ib__dot" aria-hidden="true"/>}</Link>
  </MobileTopbar>;
}

/* ---------- 应用内打开提示条（R-GLOBAL-06），受 settings.inapp_hint 控制 ---------- */
export function InAppBar() {
  const { inApp, settings, openGuide } = useStationUi();
  if (!inApp || (inApp === 'wechat' ? settings.wechat_inapp_hint !== true : settings.inapp_hint === false)) return null;
  const app = inApp === 'wechat' ? '微信' : '小红书';
  return <div className="sv-inapp" role="note">
    <span aria-hidden="true">⚠</span>
    <div className="sv-inapp__text"><b>在{app}里无法直接下载</b><br/>点右上角「···」→「在浏览器打开」</div>
    <button type="button" className="sv-btn sv-btn--ghost sv-btn--sm" onClick={openGuide}>怎么做</button>
  </div>;
}

/* ---------- 页脚（R-GLOBAL-04） ---------- */
function Footer({ settings }: { settings: Settings }) {
  const icp = settings.icp_number?.trim();
  const note = settings.footer_note?.trim();
  return <footer className="sv-foot">
    <div className="sv-foot__mobile">
      <p>{settings.site_name} · 群友整理的软件更新</p>
      <p>只整理官方信息，不存放安装包 · <Link href="/about#disclaimer">免责声明</Link></p>
      {note && <p>{note}</p>}
      {icp && <p>备案号：{icp}</p>}
    </div>
    <div className="sv-foot__desk"><div className="sv-foot__in">
      <div>
        <p><b>{settings.site_name}</b> · 群友整理的软件更新，只整理官方信息，不存放安装包</p>
        {note && <p>{note}</p>}
        {icp && <p>备案号：{icp}</p>}
      </div>
      <nav aria-label="页脚" className="sv-foot__links"><Link href="/about#about">关于本站</Link><Link href="/about#privacy">隐私说明</Link><Link href="/about#disclaimer">免责声明</Link><Link href="/admin" prefetch={false}>群主后台</Link></nav>
    </div></div>
  </footer>;
}

/* ---------- 手机底栏 ---------- */
function TabBar({ route, latest }: { route: Route; latest: Record<string, string> }) {
  const count = useNewFavorites(latest).length;
  const items: [string, string, string, boolean][] = [
    ['/', '🏠', '首页', route === 'home'], ['/software', '📦', '软件库', route === 'library' || route === 'detail'],
    ['/announcements', '📢', '公告', route === 'announcements' || route === 'announcement'], ['/me', '👤', '我的', route === 'me'],
  ];
  return <nav className="sv-tabbar" aria-label="手机导航">{items.map(([href, icon, text, on]) => <Link key={href} href={href} className={on ? 'is-on' : ''} aria-current={on ? 'page' : undefined}>
    <span className="sv-tabbar__icon" aria-hidden="true">{icon}</span>{text}{href === '/me' && <Badge count={count}/>}
  </Link>)}</nav>;
}
