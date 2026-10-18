'use client';
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
export function CopyAnnouncementLink({ slug, label = '复制公告链接' }: {slug?:string;label?:string}) {
  const [status,setStatus]=useState('');
  async function copy(){try{await navigator.clipboard.writeText(new URL(slug ? `/update/${slug}` : window.location.pathname,window.location.origin).href);setStatus('链接已复制');}catch{setStatus('未能访问剪贴板，请复制浏览器地址。');}}
  return <div className="copy-announcement"><button className="button button-secondary" onClick={copy}>{status==='链接已复制'?<Check size={16}/>:<Link2 size={16}/>}{label}</button>{status&&<span role="status">{status}</span>}</div>;
}
