import { TaskRepository, TaskRecord, TaskFilters, TaskStatus, TaskPriority } from '../../types/task.types';
import { ProjectRepository } from '../../types/project.types';
import { MembershipLookup, NotificationQueue } from '../../types/shared.types';
import { AppError } from '../../utils/AppError';

export function createTaskService(
  taskRepo: TaskRepository,
  projectRepo: ProjectRepository,
  membership: MembershipLookup,
  notificationQueue: NotificationQueue
) {
  // A task's org comes from its parent project — every task operation
  // funnels through one of these two checks.
  async function assertProjectAccessible(projectId: string, orgId: string) {
    const project = await projectRepo.findById(projectId);
    if (!project || project.deletedAt) {
      throw new AppError(404, 'Project not found', 'PROJECT_NOT_FOUND');
    }
    if (project.orgId !== orgId) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    return project;
  }

  async function getByIdScoped(taskId: string, orgId: string): Promise<TaskRecord> {
    const task = await taskRepo.findById(taskId);
    if (!task || task.deletedAt) {
      throw new AppError(404, 'Task not found', 'TASK_NOT_FOUND');
    }
    const project = await projectRepo.findById(task.projectId);
    if (!project || project.orgId !== orgId) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    return task;
  }

  async function create(
    projectId: string,
    orgId: string,
    input: { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; dueDate?: Date }
  ) {
    await assertProjectAccessible(projectId, orgId);
    return taskRepo.create({ projectId, ...input });
  }

  async function list(projectId: string, orgId: string, filters: TaskFilters, skip: number, take: number) {
    await assertProjectAccessible(projectId, orgId);
    return taskRepo.findManyByProject(projectId, filters, skip, take);
  }

  async function update(
    taskId: string,
    orgId: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      dueDate: Date | null;
    }>
  ) {
    await getByIdScoped(taskId, orgId);
    return taskRepo.update(taskId, data);
  }

  async function remove(taskId: string, orgId: string) {
    await getByIdScoped(taskId, orgId);
    await taskRepo.softDelete(taskId);
  }

  async function assignUser(taskId: string, orgId: string, targetUserId: string) {
    const task = await getByIdScoped(taskId, orgId); // confirms the task itself is in caller's org
    const targetMembership = await membership.findMembership(targetUserId);
    if (!targetMembership || targetMembership.orgId !== orgId) {
      throw new AppError(400, 'Assigned user must belong to the same organization as the task', 'INVALID_ASSIGNEE');
    }
    const existing = await taskRepo.findAssignment(taskId, targetUserId);
    if (existing) {
      throw new AppError(409, 'User is already assigned to this task', 'ALREADY_ASSIGNED');
    }

    // Persist first — this is the source of truth and must succeed or fail
    // atomically on its own.
    const assignment = await taskRepo.assignUser(taskId, targetUserId);

    // Consistency strategy: enqueueing is a best-effort side effect AFTER
    // the assignment is durably persisted. If Redis/BullMQ is unreachable
    // or enqueueing otherwise throws, we log it and still return success —
    // we deliberately do NOT roll back the already-persisted assignment,
    // since reversing a completed write is riskier than a missed/delayed
    // notification email that can be reconciled or manually retried later.
    try {
      await notificationQueue.enqueueAssignmentEmail({
        taskId: task.id,
        taskTitle: task.title,
        assigneeUserId: targetUserId,
      });
    } catch (err) {
      console.error(`Failed to enqueue assignment email for task ${taskId}:`, err);
    }

    return assignment;
  }

  async function unassignUser(taskId: string, orgId: string, targetUserId: string) {
    await getByIdScoped(taskId, orgId);
    const existing = await taskRepo.findAssignment(taskId, targetUserId);
    if (!existing) {
      throw new AppError(404, 'Assignment not found', 'ASSIGNMENT_NOT_FOUND');
    }
    await taskRepo.unassignUser(taskId, targetUserId);
  }

  return { create, list, getByIdScoped, update, remove, assignUser, unassignUser };
}

export type TaskService = ReturnType<typeof createTaskService>;