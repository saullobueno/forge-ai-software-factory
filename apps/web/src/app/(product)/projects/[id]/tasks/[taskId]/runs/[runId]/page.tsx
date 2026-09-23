import { AgentRunDetailView } from './agent-run-detail-view';

export default async function AgentRunDetailPage({
  params,
}: PageProps<'/projects/[id]/tasks/[taskId]/runs/[runId]'>) {
  const { id, taskId, runId } = await params;
  return <AgentRunDetailView projectId={id} taskId={taskId} runId={runId} />;
}
