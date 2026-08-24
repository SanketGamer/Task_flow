import { TaskRepository, TaskRecord, TaskAssignmentRecord } from '../../../src/types/task.types';

export function createFakeTaskRepository(): TaskRepository {
  const tasks = new Map<string, TaskRecord>();
  const assignments = new Map<string, TaskAssignmentRecord>(); // key: `${taskId}:${userId}`
  let counter = 0;

  return {
    async create({ projectId, title, description, status, priority, dueDate }) {
      const now = new Date();
      const task: TaskRecord = {
        id: `task_${++counter}`,
        projectId,
        title,
        description: description ?? null,
        status: status ?? 'todo',
        priority: priority ?? 'medium',
        dueDate: dueDate ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      tasks.set(task.id, task);
      return task;
    },

    async findById(id) {
      return tasks.get(id) ?? null;
    },

    async findManyByProject(projectId, filters, skip, take) {
      let all = [...tasks.values()].filter((t) => t.projectId === projectId && !t.deletedAt);
      if (filters.status) all = all.filter((t) => t.status === filters.status);
      if (filters.priority) all = all.filter((t) => t.priority === filters.priority);
      if (filters.assigneeId) {
        const assignedIds = new Set(
          [...assignments.values()].filter((a) => a.userId === filters.assigneeId).map((a) => a.taskId)
        );
        all = all.filter((t) => assignedIds.has(t.id));
      }
      if (filters.dueFrom) all = all.filter((t) => t.dueDate !== null && t.dueDate >= filters.dueFrom!);
      if (filters.dueTo) all = all.filter((t) => t.dueDate !== null && t.dueDate <= filters.dueTo!);
      all.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const total = all.length;
      return { items: all.slice(skip, skip + take), total };
    },

    async update(id, data) {
      const task = tasks.get(id);
      if (!task) throw new Error('not found');
      Object.assign(task, data, { updatedAt: new Date() });
      return task;
    },

    async softDelete(id) {
      const task = tasks.get(id);
      if (task) task.deletedAt = new Date();
    },

    async assignUser(taskId, userId) {
      const record: TaskAssignmentRecord = { id: `asg_${++counter}`, taskId, userId, assignedAt: new Date() };
      assignments.set(`${taskId}:${userId}`, record);
      return record;
    },

    async unassignUser(taskId, userId) {
      assignments.delete(`${taskId}:${userId}`);
    },

    async findAssignment(taskId, userId) {
      return assignments.get(`${taskId}:${userId}`) ?? null;
    },
  };
}