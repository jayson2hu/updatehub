import { PromotionEditor } from '@/components/station-admin/promotions';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <PromotionEditor id={(await params).id}/>; }
