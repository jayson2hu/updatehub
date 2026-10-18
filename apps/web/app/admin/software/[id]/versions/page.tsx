import { SoftwareVersions } from "@/components/admin/software-versions";

export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SoftwareVersions softwareId={id} />;
}
