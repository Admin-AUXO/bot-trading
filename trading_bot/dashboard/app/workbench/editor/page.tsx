import { ErrorBoundary } from "@/components/error-boundary";
import { WorkbenchEditorSurface } from "@/components/workbench/workbench-editor-surface";

function WorkbenchEditorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default async function WorkbenchEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ pack?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <WorkbenchEditorBoundary>
      <WorkbenchEditorSurface selectedPackId={params.pack ?? null} />
    </WorkbenchEditorBoundary>
  );
}
