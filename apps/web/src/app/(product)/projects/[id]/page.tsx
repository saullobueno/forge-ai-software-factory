import { ProjectDetailView } from './project-detail-view';

export default async function ProjectDetailPage({ params }: PageProps<'/projects/[id]'>) {
  const { id } = await params;
  return <ProjectDetailView projectId={id} />;
}
