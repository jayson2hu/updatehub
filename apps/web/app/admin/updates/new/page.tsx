import { UpdateEditor } from "@/components/admin/update-editor";

export default async function NewUpdatePage({ searchParams }: { searchParams: Promise<{ software_id?: string; mode?: string }> }) {
  const query = await searchParams;
  return <UpdateEditor initialSoftwareId={query.software_id} initialMode={query.mode === "history" ? "history" : query.mode === "release" ? "release" : undefined} />;
}
