import { WorkbenchEditorSurface } from "@/components/workbench/workbench-editor-surface";

export const dynamic = "force-dynamic";

export default async function WorkbenchEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ pack?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return <WorkbenchEditorSurface selectedPackId={params.pack ?? null} />;
}
