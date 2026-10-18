import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import "./admin.css";
import "./admin-workflow.css";
import "./admin-content.css";
import "./station-admin.css";

export const metadata: Metadata = { title: "内容管理", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) { return <AdminShell>{children}</AdminShell>; }
