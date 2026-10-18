import { StationLink as Link } from '@/components/station/design-context';
import { Search } from 'lucide-react';
export default function NotFound() { return <div className="st-page st-empty st-error"><Search size={38}/><h1>这个页面找不到了</h1><p>链接可能有误，或内容已经下架。可以去软件目录找找最新入口。</p><Link href="/software" className="st-button st-primary">前往软件目录</Link></div>; }
