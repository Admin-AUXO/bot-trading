import { redirect } from "next/navigation";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";

type SearchParamsInput = Promise<{
  bucket?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
}>;

export const dynamic = "force-dynamic";

export default async function CandidatesPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const bucket = firstParam(searchParams.bucket) ?? "ready";
  const sort = firstParam(searchParams.sort) ?? "recent";
  const q = firstParam(searchParams.q) ?? "";
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  params.set("sort", sort);
  params.set("book", "open");
  params.set("psort", "priority");
  if (q.trim().length > 0) {
    params.set("q", q.trim());
  }
  redirect(`${operationalDeskRoutes.trading}?${params.toString()}`);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
