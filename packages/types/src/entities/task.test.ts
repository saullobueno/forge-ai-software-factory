import { describe, expect, it } from 'vitest';
import { taskDependencySchema, taskSchema } from './task.ts';

const baseTimestamps = { createdAt: new Date(), updatedAt: new Date() };

describe('taskSchema', () => {
  it('aplica defaults de priority, labels e status', () => {
    const task = taskSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      projectId: '33333333-3333-3333-3333-333333333333',
      title: 'Implementar login',
      description: null,
      acceptanceCriteria: null,
      assigneeId: null,
      ...baseTimestamps,
    });

    expect(task.priority).toBe('medium');
    expect(task.labels).toEqual([]);
    expect(task.status).toBe('backlog');
  });
});

describe('taskDependencySchema', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  const otherId = '22222222-2222-2222-2222-222222222222';

  it('aceita uma dependência entre duas tarefas distintas', () => {
    expect(() =>
      taskDependencySchema.parse({
        id,
        taskId: id,
        dependsOnTaskId: otherId,
        ...baseTimestamps,
      }),
    ).not.toThrow();
  });

  it('rejeita uma tarefa que depende de si mesma', () => {
    expect(() =>
      taskDependencySchema.parse({
        id,
        taskId: id,
        dependsOnTaskId: id,
        ...baseTimestamps,
      }),
    ).toThrow(/não pode depender de si mesma/);
  });
});
