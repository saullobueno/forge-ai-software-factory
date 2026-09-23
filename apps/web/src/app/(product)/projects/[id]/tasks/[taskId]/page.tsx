import { TaskDetailView } from './task-detail-view';

export default async function TaskDetailPage({ params }: PageProps<'/projects/[id]/tasks/[taskId]'>) {
  const { id, taskId } = await params;
  return <TaskDetailView projectId={id} taskId={taskId} />;
}
