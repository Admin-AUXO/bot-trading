import { ErrorBoundary } from "@/components/error-boundary";
import { WorkbenchGraderSurface } from "@/components/workbench/workbench-grader-surface";

function WorkbenchGraderBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default async function WorkbenchGraderPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <WorkbenchGraderBoundary>
      <WorkbenchGraderSurface selectedRunId={params.runId ?? null} />
    </WorkbenchGraderBoundary>
  );
}
