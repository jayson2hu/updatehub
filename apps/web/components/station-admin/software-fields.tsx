'use client';
import type { Software } from '@/lib/station-types';
import { categoryMeta } from '@/lib/station-view';
import { Field, ImageUpload, labels } from './common';

export function guideBody(value: Software | Omit<Software, 'id' | 'favorite_count' | 'view_count'>) {
  const guides: Software['install_guides'] = {};
  const images: NonNullable<Software['install_illustrations']> = {};
  for (const platform of value.platforms) {
    const own = value.install_guides[platform] || [];
    const source = own.some(s => s.trim()) ? own : value.installation;
    const cleaned: string[] = [];
    const illustrations: Record<string, string> = {};
    source.forEach((step, index) => {
      if (!step.trim()) return;
      const image = value.install_illustrations?.[platform]?.[index];
      if (image) illustrations[String(cleaned.length)] = image;
      cleaned.push(step.trim());
    });
    if (own.some(s => s.trim())) guides[platform] = cleaned;
    if (Object.keys(illustrations).length) images[platform] = illustrations;
  }
  return { install_guides: guides, install_illustrations: images };
}

export function SoftwareFields({ value, update }: { value: Omit<Software, 'id' | 'favorite_count' | 'view_count'>; update: <K extends keyof Software>(key: K, value: Software[K]) => void }) {
  return <>
    <section className="sa-panel"><h2>分类与软件信息</h2><div className="sa-form-grid">
      <Field label="分类"><select value={value.category} onChange={e => update('category', e.target.value as Software['category'])}>{Object.entries(categoryMeta).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></Field>
      <Field label="开发者"><input maxLength={120} value={value.developer} onChange={e => update('developer', e.target.value)}/></Field>
      <Field label="官方网站"><input type="url" value={value.website_url} placeholder="https://" onChange={e => update('website_url', e.target.value)}/></Field>
      <Field label="收费说明"><input maxLength={200} value={value.pricing || ''} placeholder="例如：免费使用；部分功能需付费" onChange={e => update('pricing', e.target.value)}/></Field>
      <Field label="收录日期" hint="留空使用软件创建日期。"><input type="date" value={value.listed_at || ''} onChange={e => update('listed_at', e.target.value || null)}/></Field>
      <Field label="标签" hint="用中文逗号分隔，可参与搜索。"><input value={value.tags.join('，')} onChange={e => update('tags', e.target.value.split(/[,，]/))}/></Field>
      <Field label="详细介绍" wide><textarea rows={4} maxLength={5000} value={value.description} onChange={e => update('description', e.target.value)}/></Field>
    </div></section>
    <section className="sa-panel"><h2>各设备安装教程</h2><p className="sa-muted">每行一个步骤。留空使用软件通用步骤；配图会保存在本站。</p>
      {value.platforms.map(p => {
        const own = value.install_guides[p] || [];
        const steps = own.some(s => s.trim()) ? own : value.installation;
        const images = value.install_illustrations?.[p] || {};
        const setImage = (index: number, url: string) => update('install_illustrations', { ...value.install_illustrations, [p]: { ...images, [index]: url } });
        return <div className="sa-device-guide" key={p}><h3>{labels[p]}</h3>
          <Field label={`${labels[p]}安装步骤`}><textarea rows={3} value={own.join('\n')} placeholder="留空沿用软件通用步骤" onChange={e => update('install_guides', { ...value.install_guides, [p]: e.target.value.split('\n') })}/></Field>
          <Field label={`${labels[p]}安装提示`}><input maxLength={1000} value={value.install_tips?.[p] || ''} placeholder="例如：先备份配置，再卸载旧版" onChange={e => update('install_tips', { ...value.install_tips, [p]: e.target.value })}/></Field>
          {steps.map((step, i) => step.trim() && <div key={i} className="sa-step-image"><span>步骤 {i + 1}：{step}</span>{images[i] && <img src={images[i]} alt={`${labels[p]}步骤 ${i + 1} 配图`} width={240} loading="lazy"/>}<ImageUpload label={`上传${labels[p]}步骤 ${i + 1} 配图`} onUpload={url => setImage(i, url)}/>{images[i] && <button type="button" className="sa-text-button" onClick={() => setImage(i, '')}>移除此配图</button>}</div>)}
        </div>;
      })}
      {value.faqs.map((f, i) => <fieldset key={i} className="sa-check-group"><legend>问题 {i + 1}：{f.question || '未命名'} · 适用设备（不选表示全部）</legend>{value.platforms.map(p => <label key={p}><input type="checkbox" checked={!!f.platforms?.includes(p)} onChange={e => update('faqs', value.faqs.map((item, j) => i === j ? { ...item, platforms: e.target.checked ? [...(item.platforms || []), p] : item.platforms?.filter(v => v !== p) } : item))}/>{labels[p]}</label>)}</fieldset>)}
    </section>
  </>;
}
