import { WorkbenchRunsSurface } from "@/components/workbench/workbench-runs-surface";

export const dynamic = "force-dynamic";

export default async function WorkbenchRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <WorkbenchRunsSurface selectedRunId={runId} />;
}
