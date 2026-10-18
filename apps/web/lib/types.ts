export interface Category { id: string; name: string; slug: string; sort_order: number }
export interface OfficialLink { id?: string; label: string; url: string; type: 'website' | 'download' | 'release' | 'docs' | 'store'; platform: string | null; architecture: string | null; is_primary: boolean; is_active: boolean; last_checked_at?: string | null }
export interface Software {
  id: string; name: string; slug: string; short_name: string | null; summary: string; description: string;
  icon_url: string | null; category_id: string | null; category: Category | null; website_url: string;
  docs_url: string | null; github_url: string | null; latest_version: string | null; current_release_id: string | null;
  update_level: 'critical' | 'recommended' | 'optional' | 'hold'; update_reason: string;
  published: boolean; is_demo: boolean; aliases: string[]; tags: string[]; purposes: string[]; platforms: string[];
  official_links: OfficialLink[]; seo_title: string | null; seo_description: string | null; created_at: string; updated_at: string;
}
export interface Paginated<T> { items: T[]; total: number; page: number; page_size: number }
export interface AdminSession { user: { id: string; email: string }; csrf_token: string }
export interface AuditEntry { id: string; admin_user_id: string; action: string; resource_type: string; resource_id: string; payload: Record<string, unknown>; created_at: string }
export interface SiteSettings { site_name: string; site_description: string }
export interface ReleaseUpdate {
  id: string; slug: string; title: string; summary: string; content: string;
  kind: 'release' | 'notice' | 'maintenance'; software_id: string | null; software: Software | null;
  version: string; previous_version: string; update_level: Software['update_level'];
  changes: string[]; reason_to_update: string; who_should_update: string; who_can_wait: string;
  known_issues: string; notes: string; official_release_url: string | null; official_release_date: string | null;
  status: 'draft' | 'review' | 'published' | 'archived'; is_pinned: boolean; is_demo: boolean; is_historical: boolean;
  published_at: string | null; created_at: string; updated_at: string;
}
export type Announcement = ReleaseUpdate;
