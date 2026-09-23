import { CodeExplorerView } from './code-explorer-view';

export default async function ProjectCodePage({ params }: PageProps<'/projects/[id]/code'>) {
  const { id } = await params;
  return <CodeExplorerView projectId={id} />;
}
