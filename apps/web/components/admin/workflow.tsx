"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ui";

export function automaticSlug(prefix: string, text: string, suffix: string) {
  const name = text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 85);
  return `${name || prefix}-${suffix}`;
}

export function readSessionDraft<T extends object>(key: string, initial: T, serverRevision: string | null): T | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!value || value.serverRevision !== serverRevision || !value.draft || typeof value.draft !== "object") return null;
    return Object.fromEntries(Object.entries(initial).map(([field, fallback]) => [field, field in value.draft ? value.draft[field] : fallback])) as T;
  } catch { return null; }
}

export function clearSessionDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Browser storage can be unavailable in private sessions. */ }
}

export function useSessionDraft<T extends object>(key: string, draft: T, dirty: boolean, ready: boolean, serverRevision: string | null) {
  useEffect(() => {
    if (!ready || !dirty) return;
    try { sessionStorage.setItem(key, JSON.stringify({ draft, serverRevision })); } catch { /* Saving to the server remains available when browser storage is full. */ }
  }, [key, draft, dirty, ready, serverRevision]);
}

export function useUnsavedNavigation(dirty: boolean, onDiscard?: () => void) {
  const router = useRouter();
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin || target.pathname + target.search === window.location.pathname + window.location.search) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setDestination(target.pathname + target.search + target.hash);
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty]);
  return <ConfirmDialog open={!!destination} title="还有未保存的内容" busy={false} action="放弃修改并离开" onClose={() => setDestination(null)} onConfirm={() => { const next = destination; setDestination(null); onDiscard?.(); if (next) router.push(next); }}><p>离开后，本次尚未保存的修改将不会提交。选择取消可以继续编辑并保存。</p></ConfirmDialog>;
}
