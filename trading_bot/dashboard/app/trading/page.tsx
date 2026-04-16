import { redirect } from "next/navigation";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{
  bucket?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
  book?: string | string[] | undefined;
  psort?: string | string[] | undefined;
  pq?: string | string[] | undefined;
}>;

export default async function TradingPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first?.trim()) {
      query.set(key, first.trim());
    }
  }

  const search = query.toString();
  redirect(search ? `${operationalDeskRoutes.trading}?${search}` : operationalDeskRoutes.trading);
}
