import { redirect } from "next/navigation";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { firstParam } from "@/src/lib/use-trading-search-params";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{
  book?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
}>;

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
