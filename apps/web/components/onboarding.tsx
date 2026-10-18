'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Monitor, Laptop, CircleHelp, Check } from 'lucide-react';
import type { CollectionItem, ContentDocument } from '@/lib/content-types';
import { CollectionSelection } from './content/selection';

export function Onboarding({ collections }: { collections: ContentDocument[] }) {
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState('');
  const [purpose, setPurpose] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const applicable = collections.filter(item => !platform || !item.platforms.length || item.platforms.includes(platform) || item.platforms.includes('web'));
  const purposes = [...new Set(applicable.flatMap(item => item.purposes))];
  const matches = applicable.filter(item => item.purposes.includes(purpose));
  const entries = new Map<string, CollectionItem>();
  for (const item of matches) for (const entry of item.items) {
    if ((!platform || entry.software.platforms.includes(platform) || entry.software.platforms.includes('web')) && !entries.has(entry.software_id)) entries.set(entry.software_id, entry);
  }
  const items = [...entries.values()];
  function go(next: number) { setStep(next); window.setTimeout(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, 0); }
  return <div className="onboarding"><ol className="onboarding-steps" aria-label="建立关注清单的步骤">{['选择系统', '选择用途', '关注软件'].map((label, index) => <li key={label} className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span>{step > index + 1 ? <Check size={16}/> : index + 1}</span>{label}</li>)}</ol>
    <div className="onboarding-panel"><h2 ref={heading} tabIndex={-1}>{step === 1 ? '你使用什么系统？' : step === 2 ? '你主要用电脑做什么？' : '建立你的关注清单'}</h2>
    {step === 1 && <><p>按你要使用软件的设备选择，也可以暂时跳过。</p><div className="onboarding-choices">{[{ id: 'windows', label: 'Windows', note: 'Windows 台式机或笔记本', icon: <Monitor/> }, { id: 'macos', label: 'macOS', note: 'MacBook、iMac 或其他 Mac', icon: <Laptop/> }, { id: 'linux', label: 'Linux', note: 'Ubuntu 等 Linux 发行版', icon: <Monitor/> }, { id: '', label: '不确定', note: '先查看所有系统的软件', icon: <CircleHelp/> }].map(option => <button type="button" key={option.label} className={platform === option.id ? 'selected' : ''} aria-pressed={platform === option.id} onClick={() => { setPlatform(option.id); setPurpose(''); }}>{option.icon}<strong>{option.label}</strong><span>{option.note}</span></button>)}</div><div className="onboarding-actions"><Link href="/faq?q=系统" className="text-link">如何确认自己的系统？</Link><button type="button" className="button button-primary" onClick={() => go(2)}>下一步：选择用途<ArrowRight size={17}/></button></div></>}
    {step === 2 && <><p>根据管理员整理的场景清单推荐，你仍可以自由选择软件。</p>{purposes.length ? <div className="onboarding-purpose-choices">{purposes.map(item => <button key={item} type="button" className={purpose === item ? 'selected' : ''} aria-pressed={purpose === item} onClick={() => setPurpose(item)}>{item}{purpose === item && <Check size={18}/>}</button>)}</div> : <div className="help-empty"><p>这个系统暂时没有合适的场景清单。</p><Link href={`/software${platform ? `?platform=${platform}` : ''}`} className="button button-primary">从软件档案选择</Link></div>}<div className="onboarding-actions"><button type="button" className="button button-secondary" onClick={() => go(1)}><ArrowLeft size={17}/>返回选择系统</button><button type="button" className="button button-primary" disabled={!purpose} onClick={() => go(3)}>查看适合的软件<ArrowRight size={17}/></button></div></>}
    {step === 3 && <><div className="onboarding-context"><span>{platform ? ({ windows: 'Windows', macos: 'macOS', linux: 'Linux' }[platform]) : '全部系统'} / {purpose}</span><button type="button" onClick={() => go(2)}>修改选择</button></div><CollectionSelection key={`${platform}:${purpose}`} items={items} title={purpose} platform={platform} onboarding/>{matches.length > 0 && <div className="onboarding-source">清单来源：{matches.map(item => <Link key={item.id} href={`/collection/${item.slug}`}>{item.title}</Link>)}</div>}</>}
    </div><p className="onboarding-footnote">关注只是筛选相关公告，不会安装软件或发送消息。</p>
  </div>;
}
