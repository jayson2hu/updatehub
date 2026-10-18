import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { api, ApiError } from './server-api';
import type { Paginated } from './types';
import type { ContentDocument } from './content-types';

export type ContentKind = 'guide' | 'faq' | 'collection';
export const contentApi = { guide: '/guides', faq: '/faq', collection: '/collections' };
export const contentUrl = (item: Pick<ContentDocument, 'kind' | 'slug'>) => `${item.kind === 'faq' ? '/faq' : item.kind === 'guide' ? '/guide' : '/collection'}/${item.slug}`;
export type QueryParams = Record<string, string | string[] | undefined>;
export const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || '' : value || '').trim();

export const getContent = cache(async (kind: ContentKind, slug: string) => {
  try { return await api<ContentDocument>(`${contentApi[kind]}/${encodeURIComponent(slug)}`); }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
});

export async function listContent(kind: ContentKind, params: QueryParams = {}, pageSize = 12) {
  const query = new URLSearchParams();
  for (const key of ['q', 'software_id', 'category', 'platform', 'purpose']) {
    const value = param(params[key]);
    if (value) query.set(key, value.slice(0, key === 'software_id' ? 36 : key === 'platform' ? 20 : key === 'q' ? 160 : key === 'purpose' ? 80 : 100));
  }
  query.set('page_size', String(pageSize));
  const requested = Number(param(params.page));
  query.set('page', String(Number.isSafeInteger(requested) && requested > 0 && requested <= 10000 ? requested : 1));
  let data = await api<Paginated<ContentDocument>>(`${contentApi[kind]}?${query}`);
  const last = Math.max(1, Math.ceil(data.total / data.page_size));
  if (data.page > last) { query.set('page', String(last)); data = await api<Paginated<ContentDocument>>(`${contentApi[kind]}?${query}`); }
  return { data, query };
}

export async function allCollections() {
  const first = await listContent('collection', {}, 100);
  const items = [...first.data.items];
  for (let page = 2; items.length < first.data.total; page++) {
    const next = await listContent('collection', { page: String(page) }, 100);
    if (!next.data.items.length) break;
    items.push(...next.data.items);
  }
  return items;
}
