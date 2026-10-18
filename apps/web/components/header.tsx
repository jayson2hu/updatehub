'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Layers2, Menu, X } from 'lucide-react';
import { useRef, useState } from 'react';
export function Header({ name }: { name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const links = [{ href: '/', label: '最新公告' }, { href: '/my-software', label: '我的关注' }, { href: '/software', label: '软件档案' }, { href: '/help', label: '帮助中心' }];
  const active = (href: string) => href === '/' ? pathname === '/' || pathname === '/updates' || pathname.startsWith('/update/') : href === '/help' ? ['/help','/start','/faq','/guides','/guide','/collections','/collection','/about'].some(item => pathname === item || pathname.startsWith(`${item}/`)) : href === '/software' ? pathname === '/finder' || pathname.startsWith('/software') : pathname === href || pathname.startsWith(`${href}/`);
  return <header className="site-header" onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); menuButton.current?.focus(); } }}><div className="header-inner">
    <Link href="/" className="brand" aria-label={`${name} 公告中心`}><span className="brand-mark"><Layers2 size={24} strokeWidth={2.2} /></span><span>{name}<small>软件公告中心</small></span></Link>
    <nav className="desktop-nav" aria-label="主导航">{links.map(l => <Link key={l.href} href={l.href} className={active(l.href) ? 'active' : ''} aria-current={active(l.href) ? 'page' : undefined}>{l.label}</Link>)}</nav>
    <Link className="admin-entry" href="/admin">管理入口 <ArrowUpRight size={15}/></Link>
    <button ref={menuButton} className="menu-toggle icon-button" aria-label={open ? '关闭导航' : '打开导航'} aria-controls="mobile-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
  </div>{open && <nav id="mobile-navigation" className="mobile-nav" aria-label="手机导航">{links.map(l => <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined} onClick={() => setOpen(false)}>{l.label}</Link>)}<Link href="/start" onClick={() => setOpen(false)}>新手开始</Link><Link href="/finder" onClick={() => setOpen(false)}>帮我找软件</Link><Link href="/admin" onClick={() => setOpen(false)}>管理入口</Link></nav>}</header>;
}
