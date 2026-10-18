import { ContentEditor } from "@/components/admin/content-editor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContentEditor kind="collection" contentId={id} />;
}
