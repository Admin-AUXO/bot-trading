import { redirect } from "next/navigation";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";

type SearchParamsInput = Promise<{
  book?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
}>;

export const dynamic = "force-dynamic";

export default async function PositionsPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const book = firstParam(searchParams.book) === "closed" ? "closed" : "open";
  const sort = firstParam(searchParams.sort) ?? (book === "open" ? "priority" : "opened");
  const q = firstParam(searchParams.q) ?? "";
  const params = new URLSearchParams();
  params.set("bucket", "ready");
  params.set("sort", "recent");
  params.set("book", book);
  params.set("psort", sort);
  if (q.trim().length > 0) {
    params.set("pq", q.trim());
  }
  redirect(`${operationalDeskRoutes.trading}?${params.toString()}`);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
