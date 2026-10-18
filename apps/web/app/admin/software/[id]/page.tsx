import { SoftwareEditor } from "@/components/admin/software-editor";

export default async function EditSoftwarePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SoftwareEditor softwareId={id} />;
}
