'use client';

import type { ReactNode } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import type { StationData } from '@/lib/station-types';
import { formatDate } from '@/lib/station';
import { useDesign } from './design-context';

export function DesignHomeHeader({ data, spotlight }: { data: StationData; spotlight: ReactNode }) {
  const design = useDesign();
  const newest = [...data.releases].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))[0];
  if (design === 'a') return <header className="st-home-hero st-a-intro"><div className="st-hero-copy"><h1>最新软件更新</h1><p className="st-hero-description">{data.settings.site_description}</p></div><div className="st-a-intro-note"><ShieldCheck size={18}/><div><strong>不用登录，直接查看</strong><span>先选自己的设备，再看对应版本</span></div></div></header>;
  if (design === 'b') return <header className="st-home-hero st-b-intro"><div className="st-hero-copy"><h1>更新手册</h1><p className="st-hero-description">查最新版本，也查每一次变化。</p></div><div className="st-b-edition"><span>最近发布于</span><time>{newest ? formatDate(newest.published_at) : '暂无更新'}</time><p>{data.releases.length} 条更新记录 · {data.software.length} 款软件</p></div></header>;
  if (design === 'c') return <header className="st-home-hero st-c-banner"><div className="st-hero-copy"><h1>软件更新，<br className="st-hero-break"/>都在这儿。</h1><p className="st-hero-description">{data.settings.site_description}</p><span className="st-c-guide"><BookOpen size={17}/>找软件 · 选设备 · 按步骤安装</span></div>{spotlight}</header>;
  return null;
}
