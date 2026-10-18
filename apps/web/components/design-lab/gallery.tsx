'use client';

import Link from 'next/link';
import { useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronRight, Columns2, ExternalLink, Heart, Monitor, Search, Smartphone, SlidersHorizontal, X } from 'lucide-react';
import { designFamilies, labDesigns, labHref, labTokens, type LabDesign } from '@/lib/design-lab';

function subscribe(callback:()=>void) { window.addEventListener('storage',callback);window.addEventListener('design-lab-change',callback);return () => {window.removeEventListener('storage',callback);window.removeEventListener('design-lab-change',callback);}; }
const serverSnapshot = () => '[]';
const temporaryPreferences = new Map<string,string>();
function useSaved(key:string) {
  const value = useSyncExternalStore(subscribe,() => {try {return localStorage.getItem(key) || temporaryPreferences.get(key) || '[]';}catch{return temporaryPreferences.get(key) || '[]';}},serverSnapshot);
  let ids:string[] = [];
  try { const parsed:unknown = JSON.parse(value);if(Array.isArray(parsed)) ids = [...new Set(parsed.filter((id):id is string => typeof id === 'string' && labDesigns.some(d => d.id === id)))].slice(0,key.endsWith('compare') ? 4 : 50); }catch{}
  function set(next:string[]) { const serialized=JSON.stringify(next);temporaryPreferences.set(key,serialized);let persisted=true;try {localStorage.setItem(key,serialized);}catch{persisted=false;}window.dispatchEvent(new Event('design-lab-change'));return persisted; }
  return [ids,set] as const;
}
export function DesignLabGallery() {
  const [family,setFamily] = useState('all');
  const [search,setSearch] = useState('');
  const [device,setDevice] = useState<'mobile'|'desktop'>('mobile');
  const [savedOnly,setSavedOnly] = useState(false);
  const [recommendedOnly,setRecommendedOnly] = useState(false);
  const [saved,save] = useSaved('station-design-50-favorites');
  const [compare,setCompare] = useSaved('station-design-50-compare');
  const [message,setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = labDesigns.filter(d => (family === 'all' || d.family === family) && (!savedOnly || saved.includes(d.id)) && (!recommendedOnly || d.recommended) && [d.id,d.name,d.concept,designFamilies.find(f => f.id === d.family)?.name || ''].some(t => t.includes(search.trim())));
  function toggleSaved(id:string) { if(!save(saved.includes(id) ? saved.filter(x => x !== id) : [...saved,id])) setMessage('浏览器未允许保存偏好。可以继续收藏和对比，刷新后可能丢失。'); }
  function toggleCompare(id:string) { if(compare.includes(id)) {setCompare(compare.filter(x => x !== id));return;} if(compare.length === 4) {setMessage('最多对比4套，请先移除一套。');return;}if(!setCompare([...compare,id])) setMessage('对比项已临时保留，刷新后可能丢失。'); }
  function reset() {setFamily('all');setSearch('');setSavedOnly(false);setRecommendedOnly(false);}
  return <div className="dg-page">
    <header className="dg-header"><Link href="/" className="dg-back"><ArrowLeft size={17}/>返回小站</Link><Link href="/designs" className="dg-brand"><span><Columns2 size={19}/></span>更新小站<span>设计选集</span></Link><a href="#dg-options" className="dg-jump">浏览全部 50 套<ArrowRight size={16}/></a></header>
    <main>
      <section className="dg-hero"><div><p className="dg-intro">同一个更新小站，50 种不同的表达。</p><h1>先选喜欢的风格，<br/>再把细节做好。</h1><p className="dg-description">从清晰的工具界面，到有温度的更新刊物。<br/>每一套都能打开体验，也可以收藏后并排比较。</p><div className="dg-hero-actions"><a className="dg-primary" href="#dg-options">开始挑选<ArrowRight size={18}/></a><button className="dg-text-button" onClick={() => {setRecommendedOnly(true);setFamily('all');setSavedOnly(false);document.getElementById('dg-options')?.scrollIntoView();}}>先看 3 套推荐<ChevronRight size={17}/></button></div></div><div className="dg-hero-samples" aria-label="设计方向示意">{['02','08','21'].map(id => {const d=labDesigns.find(s=>s.id===id)!;return <Link key={id} href={labHref(id)} className={`dg-sample dg-sample-${id}`} style={labTokens(d)}><span>{id} / {d.name}</span><strong>{d.headline}</strong><div><i/><i/><i/></div><small>打开体验<ArrowRight size={13}/></small></Link>;})}<span className="dg-hero-note">50 套页面 · 10 个系列 · 手机与桌面</span></div></section>
      <section className="dg-recommend"><span className="dg-recommend-label"><Bookmark size={19}/>设计建议</span><p><b>02 设备优先</b>，适合第一次来的群友；<b>08 轻刊</b>，适合长期阅读；<b>21 森绿书签</b>，更亲切、耐看。建议先比较这三套，再看你更喜欢哪种气质。</p></section>
      <section id="dg-options" className="dg-options">
        <div className="dg-toolbar"><div className="dg-toolbar-top"><label className="dg-search"><Search size={19}/><input placeholder="搜索编号、风格或关键词" aria-label="搜索设计方案" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="清除设计搜索"><X size={17}/></button>}</label><div className="dg-device" aria-label="预览设备"><button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone size={17}/>手机</button><button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={17}/>桌面</button></div><button className={`dg-saved-toggle${savedOnly ? ' is-active' : ''}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><Heart size={17} fill={savedOnly ? 'currentColor' : 'none'}/>我的收藏<span>{saved.length}</span></button></div>
          <div className="dg-families" aria-label="设计系列"><button aria-pressed={family === 'all'} onClick={() => setFamily('all')}>全部风格 <span>50</span></button>{designFamilies.map(f => <button key={f.id} aria-pressed={family === f.id} onClick={() => setFamily(f.id)}>{f.name}<span>5</span></button>)}</div>
        </div>
        <div className="dg-results"><p>{family === 'all' ? '所有设计方向' : designFamilies.find(f=>f.id===family)?.description}<span>{visible.length} 套</span></p><div>{recommendedOnly && <button onClick={() => setRecommendedOnly(false)}>推荐方案<X size={14}/></button>}{(family !== 'all' || search || savedOnly || recommendedOnly) && <button onClick={reset}><SlidersHorizontal size={14}/>清除筛选</button>}<span>缩略图为实际页面截图</span></div></div>
        {!visible.length ? <div className="dg-empty"><Search size={32}/><h2>{savedOnly ? '还没有符合条件的收藏' : '没有找到这个风格'}</h2><p>试试「刊物」「影院」或编号，也可以清除筛选。</p><button className="dg-primary" onClick={reset}>查看全部 50 套</button></div> : <div className={`dg-grid dg-grid-${device}`}>{visible.map(d => <article className="dg-card" key={d.id} data-option={d.id}>
          <Link className="dg-preview-link" href={labHref(d.id)} aria-label={`打开${d.id} ${d.name}`}><div className={`dg-preview-stage dg-preview-${device}`} style={labTokens(d)}><Screenshot design={d} device={device}/><span className="dg-preview-open">打开体验<ExternalLink size={14}/></span></div></Link>
          <div className="dg-card-info"><div className="dg-card-heading"><span>{d.id}</span><h2><Link href={labHref(d.id)}>{d.name}</Link></h2>{d.recommended && <small>推荐</small>}<button aria-label={`${saved.includes(d.id) ? '取消收藏' : '收藏'}${d.id}`} aria-pressed={saved.includes(d.id)} onClick={() => toggleSaved(d.id)}><Heart size={19} fill={saved.includes(d.id) ? 'currentColor' : 'none'}/></button></div><p>{d.concept}</p><div className="dg-card-family"><span>{designFamilies.find(f=>f.id===d.family)?.name}</span><div aria-label="方案配色">{[d.colors[0],d.colors[2],d.colors[4]].map((color,i) => <i key={i} style={{background:color}}/>)}</div></div><div className="dg-card-actions"><Link href={labHref(d.id)}>打开方案<ArrowRight size={15}/></Link><button aria-pressed={compare.includes(d.id)} onClick={() => toggleCompare(d.id)}>{compare.includes(d.id) ? <Check size={15}/> : <Columns2 size={15}/>}加入对比</button></div></div>
        </article>)}</div>}
      </section>
      <footer className="dg-footer"><strong>选定一个方向，再打磨到上线。</strong><p>这 50 套用于审查视觉与主要浏览流程。软件发布、管理后台和数据继续使用现有主站。</p><Link href="/">回到更新小站<ArrowRight size={16}/></Link></footer>
    </main>
    {compare.length > 0 && <div className="dg-compare-tray"><div><Columns2 size={20}/><strong>已选 {compare.length}/4 套</strong><span>{compare.join(' / ')}</span></div><button className="dg-clear" onClick={() => setCompare([])}>清空</button><button className="dg-primary" onClick={() => dialog.current?.showModal()}>并排对比<ArrowRight size={17}/></button></div>}
    {message && <div className="dg-toast" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}><X size={16}/></button></div>}
    <dialog ref={dialog} className="dg-compare-dialog" onClick={e => {if(e.target === dialog.current) dialog.current.close();}}><div className="dg-compare-header"><div><h2>并排看看，哪套更适合你的群友？</h2><p>拖动横向滚动条，可以查看所有方案。</p></div><div className="dg-device"><button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone size={17}/>手机</button><button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={17}/>桌面</button></div><button className="dg-close" aria-label="关闭对比" onClick={() => dialog.current?.close()}><X size={22}/></button></div><div className={`dg-comparison dg-comparison-${device}`}>{compare.map(id => {const d=labDesigns.find(x=>x.id===id)!;return <article key={id}><header><span>{id}</span><h3>{d.name}</h3><button aria-label={`移除对比${id}`} onClick={() => {toggleCompare(id);if(compare.length === 1) dialog.current?.close();}}><X size={17}/></button></header><div className="dg-comparison-image" style={labTokens(d)}><Screenshot design={d} device={device}/></div><dl><dt>适合</dt><dd>{d.fit}</dd><dt>取舍</dt><dd>{d.tradeoff}</dd></dl><Link className="dg-primary" href={labHref(id)}>打开完整方案<ExternalLink size={16}/></Link><Link className="dg-detail-link" href={labHref(id,'/software/guangmu?platform=tv')}>查看软件与历史版本<ChevronRight size={15}/></Link></article>;})}</div></dialog>
  </div>;
}

function Screenshot({design:d,device}:{design:LabDesign;device:'mobile'|'desktop'}) {
  const [failed,setFailed] = useState(false);
  const source = `/design-previews/50/${d.id}-${device}.jpg`;
  return <div className={`dg-screenshot dg-screenshot-${device}`}>
    <div className={`dg-thumbnail-fallback dg-fallback-${d.family}`} style={labTokens(d)}><header>更新小站 <span>最新　软件　公告</span></header><h3>{d.headline}</h3><p>软件更新、安装说明和群公告，都在这里。</p><aside>重要提醒：安装前请查看设备与版本</aside><div className="dg-fallback-search">搜索软件名称或别名</div><nav>全部　安卓　苹果　电视　电脑</nav>{['光幕影视','青柠影视','云帆播放器'].map((s,i) => <section key={s}><i style={{background:['#326aa2','#4c8c61','#725bb4'][i]}}/><div><strong>{s}</strong><span>修复部分设备的使用问题。</span></div><b>查看更新</b></section>)}</div>
    {!failed && <img key={source} src={source} alt={`${d.id} ${d.name}，${device === 'mobile' ? '手机' : '桌面'}首页实拍`} loading="lazy" width={device === 'mobile' ? 390 : 1440} height={device === 'mobile' ? 844 : 1000} onError={() => setFailed(true)}/>}
  </div>;
}
