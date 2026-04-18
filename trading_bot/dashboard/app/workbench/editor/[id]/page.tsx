import { WorkbenchEditorSurface } from "@/components/workbench/workbench-editor-surface";

export const dynamic = "force-dynamic";

export default async function WorkbenchEditorByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkbenchEditorSurface selectedPackId={id} />;
}
