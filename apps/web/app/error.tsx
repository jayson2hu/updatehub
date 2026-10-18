'use client';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <div className="st-page st-empty st-error"><WifiOff size={38}/><h1>内容暂时没有加载出来</h1><p>网络或服务可能暂时繁忙。请检查网络，然后重新加载。</p><div className="st-error-actions"><button className="st-button st-primary" onClick={reset}>重新加载</button><Link href="/" className="st-button st-secondary">回到最新更新</Link></div></div>; }
