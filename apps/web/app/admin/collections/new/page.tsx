import { ContentEditor } from "@/components/admin/content-editor";

export default async function Page({ searchParams }: { searchParams: Promise<{ software_id?: string }> }) {
  const params = await searchParams;
  return <ContentEditor kind="collection" initialSoftwareId={params.software_id} />;
}
