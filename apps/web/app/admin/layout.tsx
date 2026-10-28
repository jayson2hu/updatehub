import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
// Keep the existing editor dependencies without sending them to visitor pages.
import "../globals.css";
import "../announcement.css";
import "../version-history.css";
import "../product-workflows.css";
import "../product-design.css";
import "../station-design.css";
import "./admin.css";
import "./admin-workflow.css";
import "./admin-content.css";
import "./station-admin.css";
import "./station-v5.css";
// Theme tokens last: light values match the stylesheets above, dark values are derived per role.
import "./admin-theme.css";

export const metadata: Metadata = { title: "内容管理", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) { return <AdminShell>{children}</AdminShell>; }
