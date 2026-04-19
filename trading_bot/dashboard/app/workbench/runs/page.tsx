import { ErrorBoundary } from "@/components/error-boundary";
import { WorkbenchRunsSurface } from "@/components/workbench/workbench-runs-surface";

function WorkbenchRunsBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default async function WorkbenchRunsPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <WorkbenchRunsBoundary>
      <WorkbenchRunsSurface selectedRunId={params.runId ?? null} />
    </WorkbenchRunsBoundary>
  );
}
