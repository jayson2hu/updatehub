'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, Check, Monitor, Smartphone, Star } from 'lucide-react';
import { designOptions, isDesignVariant, type DesignVariant } from '@/lib/design-options';
import { BrandMark } from './common';

const preferenceKey = 'station-design-preference';
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('station-design-choice', listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('station-design-choice', listener); };
}
function getPreference(): DesignVariant | null {
  try { const value = window.localStorage.getItem(preferenceKey); return value && isDesignVariant(value) ? value : null; }
  catch { return null; }
}

export function DesignGallery({ siteName }: { siteName: string }) {
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile');
  const savedChoice = useSyncExternalStore(subscribe, getPreference, () => null);
  const [fallbackChoice, setFallbackChoice] = useState<DesignVariant | null>(null);
  const choice = fallbackChoice || savedChoice;
  function choose(value: DesignVariant) {
    setFallbackChoice(value);
    try { window.localStorage.setItem(preferenceKey, value); window.dispatchEvent(new Event('station-design-choice')); } catch { /* 本页仍可记录选择。 */ }
  }
  return <div className="dg-site">
    <a className="skip-link" href="#design-main">跳到方案对比</a>
    <header className="dg-header"><div><Link href="/" className="st-brand"><span className="st-brand-icon"><BrandMark/></span><span>{siteName}</span></Link><Link className="dg-back" href="/">查看当前版本<ArrowUpRight size={16}/></Link></div></header>
    <main className="dg-page" id="design-main">
      <div className="dg-intro"><div><h1>三种方向，一起对比。</h1><p>用相同的软件和更新，比较手机阅读、查找效率和视觉风格。<br className="dg-desktop-break"/>每套都可以打开首页、软件目录和详情页，实际点一点。</p></div><div className="dg-view-controls" role="group" aria-label="预览截图设备"><button type="button" className={viewport === 'mobile' ? 'dg-selected' : ''} aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><Smartphone size={17}/>手机效果</button><button type="button" className={viewport === 'desktop' ? 'dg-selected' : ''} aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><Monitor size={18}/>电脑效果</button></div></div>
      <aside className="dg-recommendation"><span className="dg-recommend-icon"><Star size={20}/></span><div><strong>我更推荐 A · 清晰直达</strong><p>群友主要用手机打开，最重要的是迅速看清软件、版本和设备。A 的阅读与操作最贴近这个目标。</p></div><Link href="/designs/a">先看 A<ArrowUpRight size={17}/></Link></aside>
      <div className={`dg-options dg-mode-${viewport}`}>{designOptions.map(option => <article className={`dg-card${choice === option.id ? ' dg-chosen' : ''}`} key={option.id}>
        <div className="dg-card-heading"><span style={{ background: option.color }}>{option.id.toUpperCase()}</span><div><h2>{option.name}</h2><p>{option.recommended ? '易用性优先' : option.id === 'b' ? '信息效率优先' : '品牌辨识度优先'}</p></div>{option.recommended && <span className="dg-recommended">推荐</span>}</div>
        <Link className="dg-preview" href={`/designs/${option.id}`} aria-label={`打开方案 ${option.id.toUpperCase()} ${option.name}`}><img src={`/design-previews/${option.id}-${viewport}.png`} alt={`${option.name}的${viewport === 'mobile' ? '手机' : '电脑'}首页实际截图`} width={viewport === 'mobile' ? 390 : 1440} height={viewport === 'mobile' ? 844 : 1000}/><span>打开实际页面<ArrowUpRight size={16}/></span></Link>
        <div className="dg-card-content"><p className="dg-description">{option.description}</p><ul>{option.strengths.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul><p className="dg-tradeoff"><strong>取舍</strong>{option.tradeoff}</p><div className="dg-card-actions"><Link href={`/designs/${option.id}`} className="dg-open">进入方案 {option.id.toUpperCase()}<ArrowUpRight size={17}/></Link><button type="button" onClick={() => choose(option.id)} aria-pressed={choice === option.id}>{choice === option.id ? <><Check size={16}/>已暂选</> : '暂选这套'}</button></div></div>
      </article>)}</div>
      <p className="dg-choice" role="status">{choice ? `当前暂选 ${choice.toUpperCase()} · ${designOptions.find(option => option.id === choice)?.name}。确定后告诉我 A、B 或 C，也可以组合喜欢的部分。` : '可以先暂选一套，再打开详情页体验。确定后告诉我 A、B 或 C，也可以组合喜欢的部分。'}</p>
      <section className="dg-advice"><div><h2>怎么选更合适？</h2><p>先用手机找一款软件，再切换设备、看看安装步骤。最容易完成这三步的方案，更适合作为正式版本。</p></div><div><h3>A：现在最稳妥的选择</h3><p>兼顾清楚、轻巧和可信，普通群友第一次打开也容易理解。</p></div><div><h3>B：更新多时更有优势</h3><p>如果以后每天发布很多条更新，可以采用 B 的日期结构和列表密度。</p></div><div><h3>C：品牌与活动更突出</h3><p>适合希望小站有更鲜明风格的方向；建议保持获取入口独立、首屏内容紧凑。</p></div></section>
    </main><footer className="dg-footer">三套方案使用同一份实际内容 · 软件获取入口与推广入口独立</footer>
  </div>;
}
