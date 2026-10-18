import type { Metadata } from 'next';
import { DesignLabGallery } from '@/components/design-lab/gallery';
export const metadata:Metadata = { title:'50 套设计选集', robots:{index:false,follow:false} };
export default function DesignsPage() { return <DesignLabGallery/>; }
