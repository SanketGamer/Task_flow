import { z } from 'zod';

export const taskStatusEnum = z.enum(['todo', 'in_progress', 'review', 'done']);
export const taskPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const taskFilterQuerySchema = z.object({
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assignee: z.string().min(1).optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const assignUserSchema = z.object({
  userId: z.string().min(1),
});