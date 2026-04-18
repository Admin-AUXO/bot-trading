import { WorkbenchGraderSurface } from "@/components/workbench/workbench-grader-surface";

export const dynamic = "force-dynamic";

export default async function WorkbenchGraderRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <WorkbenchGraderSurface selectedRunId={runId} />;
}
