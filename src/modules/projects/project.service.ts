import { ProjectRepository, ProjectRecord } from '../../types/project.types';
import { AppError } from '../../utils/AppError';
import { OrgRole } from '../../types/auth.types';

export function createProjectService(repo: ProjectRepository) {
  async function create(orgId: string, input: { name: string; description?: string }): Promise<ProjectRecord> {
    return repo.create({ orgId, ...input });
  }

  async function list(orgId: string, skip: number, take: number) {
    return repo.findManyByOrg(orgId, skip, take);
  }

  // The core multi-tenant guard. Every other method funnels through this.
  async function getByIdScoped(id: string, orgId: string): Promise<ProjectRecord> {
    const project = await repo.findById(id);
    if (!project || project.deletedAt) {
      throw new AppError(404, 'Project not found', 'PROJECT_NOT_FOUND');
    }
    if (project.orgId !== orgId) {
      // Cross-tenant attempt: 403, and the response carries no projectproject.repository.fake.ts
      // fields — just confirmation that access is denied.
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    return project;
  }

  async function update(
    id: string,
    orgId: string,
    data: { name?: string; description?: string }
  ): Promise<ProjectRecord> {
    await getByIdScoped(id, orgId); // enforces 404/403 before any mutation
    return repo.update(id, data);
  }

  async function remove(id: string, orgId: string, role: OrgRole): Promise<void> {
    if (role !== 'org_admin') {
      throw new AppError(403, 'Only organization admins can delete projects', 'ADMIN_REQUIRED');
    }
    await getByIdScoped(id, orgId);
    await repo.softDelete(id);
  }

  async function dashboard(id: string, orgId: string) {
    await getByIdScoped(id, orgId);
    return repo.taskCountsByStatus(id);
  }

  return { create, list, getByIdScoped, update, remove, dashboard };
}

export type ProjectService = ReturnType<typeof createProjectService>;