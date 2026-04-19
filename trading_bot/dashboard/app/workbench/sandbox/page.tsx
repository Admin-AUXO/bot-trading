import { ErrorBoundary } from "@/components/error-boundary";
import { WorkbenchSandboxSurface } from "@/components/workbench/workbench-sandbox-surface";

function WorkbenchSandboxBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default async function WorkbenchSandboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <WorkbenchSandboxBoundary>
      <WorkbenchSandboxSurface selectedRunId={params.runId ?? null} />
    </WorkbenchSandboxBoundary>
  );
}
