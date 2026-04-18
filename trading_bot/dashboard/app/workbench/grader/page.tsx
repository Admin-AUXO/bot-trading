import { WorkbenchGraderSurface } from "@/components/workbench/workbench-grader-surface";

export const dynamic = "force-dynamic";

export default async function WorkbenchGraderPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return <WorkbenchGraderSurface selectedRunId={params.runId ?? null} />;
}
