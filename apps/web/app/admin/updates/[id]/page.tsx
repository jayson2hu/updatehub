import { UpdateEditor } from "@/components/admin/update-editor";

export default async function EditUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UpdateEditor updateId={id} />;
}
