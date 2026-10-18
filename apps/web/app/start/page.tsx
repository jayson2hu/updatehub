import { allCollections } from '@/lib/public-content';
import { HelpBreadcrumb } from '@/components/content/common';
import { Onboarding } from '@/components/onboarding';
export const metadata = { title: '新手开始', description: '选择系统和用途，建立适合自己的软件关注清单。', alternates: { canonical: '/start' } };
export default async function StartPage() { const collections = await allCollections(); return <div className="page-container help-page start-page"><HelpBreadcrumb title="新手开始"/><header className="help-heading"><h1>从你正在用的软件开始</h1><p>三个步骤建立关注清单，以后集中查看相关公告。</p></header><Onboarding collections={collections}/></div>; }
