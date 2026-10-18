import { ContentList } from "@/components/admin/content-list";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  return <ContentList kind="faq" initialStatus={["draft", "published", "archived"].includes(params.status || "") ? params.status : ""} initialQuery={params.q || ""} />;
}
