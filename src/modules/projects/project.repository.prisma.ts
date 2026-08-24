import { PrismaClient } from '@prisma/client';
import { ProjectRepository, TaskStatusCounts } from '../../types/project.types';

export function createPrismaProjectRepository(prisma: PrismaClient): ProjectRepository {
  return {
    async create({ orgId, name, description }) {
      return prisma.project.create({ data: { orgId, name, description } });
    },

    async findById(id) {
      return prisma.project.findUnique({ where: { id } });
    },

    async findManyByOrg(orgId, skip, take) {
      const where = { orgId, deletedAt: null };
      const [items, total] = await Promise.all([
        prisma.project.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } }),
        prisma.project.count({ where }),
      ]);
      return { items, total };
    },

    async update(id, data) {
      return prisma.project.update({ where: { id }, data });
    },

    async softDelete(id) {
      await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    },

    async taskCountsByStatus(projectId): Promise<TaskStatusCounts> {
      const rows = await prisma.task.groupBy({
        by: ['status'],
        where: { projectId, deletedAt: null },
        _count: { status: true },
      });
      const counts: TaskStatusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
      for (const row of rows) {
        counts[row.status as keyof TaskStatusCounts] = row._count.status;
      }
      return counts;
    },
  };
}