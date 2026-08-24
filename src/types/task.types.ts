export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskRecord {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueFrom?: Date;
  dueTo?: Date;
}

export interface TaskAssignmentRecord {
  id: string;
  taskId: string;
  userId: string;
  assignedAt: Date;
}

export interface TaskRepository {
  create(input: {
    projectId: string;
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: Date;
  }): Promise<TaskRecord>;
  // Not org-scoped — same reasoning as ProjectRepository.findById.
  findById(id: string): Promise<TaskRecord | null>;
  findManyByProject(
    projectId: string,
    filters: TaskFilters,
    skip: number,
    take: number
  ): Promise<{ items: TaskRecord[]; total: number }>;
  update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      dueDate: Date | null;
    }>
  ): Promise<TaskRecord>;
  softDelete(id: string): Promise<void>;
  assignUser(taskId: string, userId: string): Promise<TaskAssignmentRecord>;
  unassignUser(taskId: string, userId: string): Promise<void>;
  findAssignment(taskId: string, userId: string): Promise<TaskAssignmentRecord | null>;
}