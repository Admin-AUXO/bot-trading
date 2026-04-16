import { redirect } from "next/navigation";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

export default function Page() {
  redirect(operationalDeskRoutes.overview);
}
