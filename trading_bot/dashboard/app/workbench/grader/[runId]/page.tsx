import { redirect } from "next/navigation";
import { workbenchRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

export default async function WorkbenchGraderRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  redirect(`${workbenchRoutes.runsByIdPrefix}/${encodeURIComponent(runId)}`);
}
