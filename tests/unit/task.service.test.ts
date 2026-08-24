import { createTaskService } from '../../src/modules/tasks/task.service';
import { createFakeTaskRepository } from './fakes/task.repository.fake';
import { createFakeProjectRepository } from './fakes/project.repository.fake';
import { createFakeMembershipLookup } from './fakes/membership.fake';

const ORG_A = 'org_a';
const ORG_B = 'org_b';

function setup(memberships: Record<string, { orgId: string; role: 'org_admin' | 'member' }> = {}) {
  const taskRepo = createFakeTaskRepository();
  const projectRepo = createFakeProjectRepository();
  const membership = createFakeMembershipLookup(memberships);
  const service = createTaskService(taskRepo, projectRepo, membership);
  return { taskRepo, projectRepo, service };
}

describe('TaskService', () => {
  it('creates a task under a project in the caller org, defaulting status/priority', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Design homepage' });
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
  });

  it('create rejects a project belonging to a different org (403)', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    await expect(
      service.create(project.id, ORG_B, { title: 'Should fail' })
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('create rejects an unknown project id (404)', async () => {
    const { service } = setup();
    await expect(
      service.create('nope', ORG_A, { title: 'Should fail' })
    ).rejects.toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
  });

  it('getByIdScoped returns 404 for an unknown task, 403 for a cross-org task', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Design homepage' });

    await expect(service.getByIdScoped('nope', ORG_A)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
    await expect(service.getByIdScoped(task.id, ORG_B)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    await expect(service.getByIdScoped(task.id, ORG_A)).resolves.toMatchObject({ id: task.id });
  });

  it('list filters by status and by priority', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    await service.create(project.id, ORG_A, { title: 'A', status: 'todo', priority: 'low' });
    await service.create(project.id, ORG_A, { title: 'B', status: 'done', priority: 'urgent' });
    await service.create(project.id, ORG_A, { title: 'C', status: 'todo', priority: 'high' });

    const byStatus = await service.list(project.id, ORG_A, { status: 'todo' }, 0, 20);
    expect(byStatus.total).toBe(2);

    const byPriority = await service.list(project.id, ORG_A, { priority: 'urgent' }, 0, 20);
    expect(byPriority.total).toBe(1);
    expect(byPriority.items[0].title).toBe('B');
  });

  it('list filters by due-date range', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    await service.create(project.id, ORG_A, { title: 'Early', dueDate: new Date('2026-01-01') });
    await service.create(project.id, ORG_A, { title: 'Mid', dueDate: new Date('2026-06-01') });
    await service.create(project.id, ORG_A, { title: 'Late', dueDate: new Date('2026-12-01') });

    const result = await service.list(
      project.id,
      ORG_A,
      { dueFrom: new Date('2026-03-01'), dueTo: new Date('2026-09-01') },
      0,
      20
    );
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Mid');
  });

  it('list filters by assignee', async () => {
    const { service, projectRepo } = setup({ user_1: { orgId: ORG_A, role: 'member' } });
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const taskA = await service.create(project.id, ORG_A, { title: 'Assigned' });
    await service.create(project.id, ORG_A, { title: 'Unassigned' });
    await service.assignUser(taskA.id, ORG_A, 'user_1');

    const result = await service.list(project.id, ORG_A, { assigneeId: 'user_1' }, 0, 20);
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(taskA.id);
  });

  it('update rejects cross-org access', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Original' });
    await expect(
      service.update(task.id, ORG_B, { title: 'Hijacked' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('remove soft-deletes; task then 404s on subsequent access', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Delete me' });
    await service.remove(task.id, ORG_A);
    await expect(service.getByIdScoped(task.id, ORG_A)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('assignUser rejects a target user from a different org (400 INVALID_ASSIGNEE)', async () => {
    const { service, projectRepo } = setup({ outsider: { orgId: ORG_B, role: 'member' } });
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Task' });
    await expect(
      service.assignUser(task.id, ORG_A, 'outsider')
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ASSIGNEE' });
  });

  it('assignUser rejects an unknown user id (400 INVALID_ASSIGNEE)', async () => {
    const { service, projectRepo } = setup();
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Task' });
    await expect(
      service.assignUser(task.id, ORG_A, 'ghost')
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ASSIGNEE' });
  });

  it('assignUser succeeds for a same-org user, and rejects a duplicate assignment (409)', async () => {
    const { service, projectRepo } = setup({ user_1: { orgId: ORG_A, role: 'member' } });
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Task' });

    await service.assignUser(task.id, ORG_A, 'user_1');
    await expect(
      service.assignUser(task.id, ORG_A, 'user_1')
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_ASSIGNED' });
  });

  it('unassignUser removes an existing assignment; 404 if none exists', async () => {
    const { service, projectRepo, taskRepo } = setup({ user_1: { orgId: ORG_A, role: 'member' } });
    const project = await projectRepo.create({ orgId: ORG_A, name: 'Website' });
    const task = await service.create(project.id, ORG_A, { title: 'Task' });

    await expect(service.unassignUser(task.id, ORG_A, 'user_1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'ASSIGNMENT_NOT_FOUND',
    });

    await service.assignUser(task.id, ORG_A, 'user_1');
    await service.unassignUser(task.id, ORG_A, 'user_1');
    await expect(taskRepo.findAssignment(task.id, 'user_1')).resolves.toBeNull();
  });
});