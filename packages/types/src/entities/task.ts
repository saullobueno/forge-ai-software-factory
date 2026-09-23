import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common';
import { taskPrioritySchema, taskStatusSchema } from '../enums';

export const taskSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  acceptanceCriteria: z.string().max(10_000).nullable(),
  priority: taskPrioritySchema.default('medium'),
  labels: z.array(z.string().min(1).max(50)).default([]),
  assigneeId: idSchema.nullable(),
  status: taskStatusSchema.default('backlog'),
  ...timestampsSchema.shape,
});
export type Task = z.infer<typeof taskSchema>;

export const taskDependencySchema = z
  .object({
    id: idSchema,
    taskId: idSchema,
    dependsOnTaskId: idSchema,
    ...timestampsSchema.shape,
  })
  .refine((dependency) => dependency.taskId !== dependency.dependsOnTaskId, {
    message: 'Uma tarefa não pode depender de si mesma',
    path: ['dependsOnTaskId'],
  });
export type TaskDependency = z.infer<typeof taskDependencySchema>;
