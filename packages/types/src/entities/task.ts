import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { taskPrioritySchema, taskStatusSchema } from '../enums.ts';

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

/** Corpo de `POST /projects/:id/tasks`. */
export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10_000).optional(),
  acceptanceCriteria: z.string().trim().max(10_000).optional(),
  priority: taskPrioritySchema.default('medium'),
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

/**
 * Corpo de `PATCH /tasks/:id`. O status não é editável aqui: ele avança pelas
 * transições de `@forge/domain` conforme as execuções de IA acontecem.
 */
export const updateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(10_000).nullable(),
    acceptanceCriteria: z.string().trim().max(10_000).nullable(),
    priority: taskPrioritySchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo para atualizar.' });
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

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
