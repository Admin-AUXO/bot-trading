import { redirect } from "next/navigation";
import { marketRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

export default function MarketRootPage() {
  redirect(marketRoutes.trending);
}
