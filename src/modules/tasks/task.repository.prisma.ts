import { PrismaClient, Prisma } from '@prisma/client';
import { TaskRepository } from '../../types/task.types';

export function createPrismaTaskRepository(prisma: PrismaClient): TaskRepository {
  return {
    async create({ projectId, title, description, status, priority, dueDate }) {
      return prisma.task.create({ data: { projectId, title, description, status, priority, dueDate } });
    },

    async findById(id) {
      return prisma.task.findUnique({ where: { id } });
    },

    async findManyByProject(projectId, filters, skip, take) {
      const where: Prisma.TaskWhereInput = { projectId, deletedAt: null };
      if (filters.status) where.status = filters.status;
      if (filters.priority) where.priority = filters.priority;
      if (filters.assigneeId) where.assignments = { some: { userId: filters.assigneeId } };
      if (filters.dueFrom || filters.dueTo) {
        where.dueDate = {
          ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
          ...(filters.dueTo ? { lte: filters.dueTo } : {}),
        };
      }
      const [items, total] = await Promise.all([
        prisma.task.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } }),
        prisma.task.count({ where }),
      ]);
      return { items, total };
    },

    async update(id, data) {
      return prisma.task.update({ where: { id }, data });
    },

    async softDelete(id) {
      await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    },

    async assignUser(taskId, userId) {
      return prisma.taskAssignment.create({ data: { taskId, userId } });
    },

    async unassignUser(taskId, userId) {
      await prisma.taskAssignment.deleteMany({ where: { taskId, userId } });
    },

    async findAssignment(taskId, userId) {
      return prisma.taskAssignment.findUnique({ where: { taskId_userId: { taskId, userId } } });
    },
  };
}