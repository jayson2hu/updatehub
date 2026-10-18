export type Platform = 'android' | 'ios' | 'tv' | 'desktop';
export type Status = 'normal' | 'attention' | 'unavailable';
export interface Software { id: string; slug: string; name: string; aliases: string[]; summary: string; icon_url: string; color: string; platforms: Platform[]; status: Status; status_reason: string; installation: string[]; faqs: { question: string; answer: string }[]; screenshots: string[]; published: boolean; is_demo: boolean }
export interface DownloadLink { id?: string; label: string; url: string; code: string; is_primary: boolean }
export interface Release { id: string; software_id: string; platform: Platform; version: string; summary: string; notes: string; status: Status; status_reason: string; links: DownloadLink[]; install_notice: string; published: boolean; published_at: string | null; created_at: string }
export interface Announcement { id: string; slug: string; title: string; summary: string; body: string; category: 'group' | 'usage' | 'maintenance'; importance: 'normal' | 'important' | 'urgent'; pinned: boolean; expires_at: string | null; software_ids: string[]; images: string[]; links: { label: string; url: string }[]; published: boolean; published_at: string | null; is_demo: boolean; expired?: boolean; effective_pinned?: boolean }
export interface Settings { site_name: string; site_description: string; instructions: string; ads_enabled: boolean }
export interface Promotion { id: string; slug: string; title: string; summary: string; body: string; cover_url: string; action_label: string; target_url: string; starts_at: string | null; ends_at: string | null; published: boolean; placements: string[] }
export interface StationData { settings: Settings; software: Software[]; releases: Release[]; announcements: Announcement[]; promotions: Promotion[] }
export interface SoftwareData { software: Software; releases: Release[]; announcements: Announcement[] }
