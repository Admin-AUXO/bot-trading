import { redirect } from "next/navigation";
import { workbenchRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

export default function WorkbenchRootPage() {
  redirect(workbenchRoutes.packs);
}
