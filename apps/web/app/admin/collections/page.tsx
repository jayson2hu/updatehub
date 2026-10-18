import { ContentList } from "@/components/admin/content-list";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  return <ContentList kind="collection" initialStatus={["draft", "published", "archived"].includes(params.status || "") ? params.status : ""} initialQuery={params.q || ""} />;
}
