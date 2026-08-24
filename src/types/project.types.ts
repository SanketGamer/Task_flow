export interface ProjectRecord {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TaskStatusCounts {
  todo: number;
  in_progress: number;
  review: number;
  done: number;
}

export interface ProjectRepository {
  create(input: { orgId: string; name: string; description?: string }): Promise<ProjectRecord>;
  // Deliberately NOT org-scoped: the service layer fetches by id alone,
  // then decides 404 (doesn't exist) vs 403 (exists, wrong org) itself.
  // See Step 6 design note on cross-tenant access requirements.
  findById(id: string): Promise<ProjectRecord | null>;
  findManyByOrg(orgId: string, skip: number, take: number): Promise<{ items: ProjectRecord[]; total: number }>;
  update(id: string, data: Partial<{ name: string; description: string | null }>): Promise<ProjectRecord>;
  softDelete(id: string): Promise<void>;
  taskCountsByStatus(projectId: string): Promise<TaskStatusCounts>;
}