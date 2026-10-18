import type { AuditEntry, Category, ReleaseUpdate, Software } from "./types";

export type ContentKind = "guide" | "faq" | "collection";
export type ContentStatus = "draft" | "published" | "archived";
export type ContentImportance = "required" | "recommended" | "optional";
export interface ContentSection { title: string; body: string }
export interface CollectionItem {
  id: string;
  software_id: string;
  software: Software;
  sort_order: number;
  importance: ContentImportance;
  note: string;
}
export interface ContentDocument {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  summary: string;
  content: string;
  sections: ContentSection[];
  software_id: string | null;
  software: Software | null;
  category_id: string | null;
  category: Category | null;
  platforms: string[];
  purposes: string[];
  status: ContentStatus;
  sort_order: number;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  items: CollectionItem[];
}
export interface DashboardData {
  days: number;
  totals: {
    software: number; published_software: number; updates: number; published_updates: number;
    guides: number; faq: number; collections: number; published_content: number;
    pending_content: number; pending_updates: number;
  };
  analytics: {
    searches: number; no_result_searches: number; official_clicks: number;
    daily: { date: string; searches: number; no_result_searches: number; official_clicks: number }[];
    top_searches: { query: string; scope: string; searches: number; no_result_searches: number }[];
    top_no_result_searches: { query: string; scope: string; searches: number; no_result_searches: number }[];
    top_software: { software_id: string; name: string; slug: string; clicks: number }[];
    top_links: { official_link_id: string; software_id: string; label: string; clicks: number }[];
  };
  pending_content: ContentDocument[];
  pending_updates: ReleaseUpdate[];
  gaps: { software_id: string; name: string; slug: string; missing: string[] }[];
  recent_actions: AuditEntry[];
}

export const contentKinds = {
  guide: { name: "指南", heading: "指南管理", directory: "guides", publicDirectory: "guide", description: "按实际步骤说明如何开始、设置和排查问题。" },
  faq: { name: "常见问题", heading: "常见问题", directory: "faqs", publicDirectory: "faq", description: "一个问题、一条清楚的答案，让用户快速找到下一步。" },
  collection: { name: "合集", heading: "合集管理", directory: "collections", publicDirectory: "collection", description: "按使用场景组织软件，说明选择理由与使用顺序。" },
} as const;

export function contentAdminPath(kind: ContentKind, id?: string) { return `/admin/${contentKinds[kind].directory}${id ? `/${id}` : ""}`; }
export function contentPublicPath(item: Pick<ContentDocument, "kind" | "slug">) { return `/${contentKinds[item.kind].publicDirectory}/${item.slug}`; }
