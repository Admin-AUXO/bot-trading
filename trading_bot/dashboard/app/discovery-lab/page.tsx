import { redirect } from "next/navigation";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

export default function DiscoveryLabPage() {
  redirect(discoveryLabRoutes.overview);
}
