import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createFakeAuthRepository } from '../unit/fakes/auth.repository.fake';
import { createProjectService } from '../../src/modules/projects/project.service';
import { createFakeProjectRepository } from '../unit/fakes/project.repository.fake';
import { createTaskService } from '../../src/modules/tasks/task.service';
import { createFakeTaskRepository } from '../unit/fakes/task.repository.fake';
import { createFakeNotificationQueue } from '../unit/fakes/notificationQueue.fake';

function createFakeQueue() {
  const jobs = new Map<string, { id: string; attemptsMade: number; data: unknown; failedReason?: string; timestamp: number; state: string }>();
  return {
    seed(id: string, state: string, data: unknown = {}) {
      jobs.set(id, { id, attemptsMade: 1, data, timestamp: Date.now(), state });
    },
    async getJob(id: string) {
      const j = jobs.get(id);
      if (!j) return null;
      return { ...j, getState: async () => j.state };
    },
  };
}

async function freshAppWithProject() {
  const authRepo = createFakeAuthRepository();
  const authService = createAuthService(authRepo);
  const projectRepo = createFakeProjectRepository();
  const projectService = createProjectService(projectRepo);
  const taskService = createTaskService(createFakeTaskRepository(), projectRepo, authRepo, createFakeNotificationQueue().queue);
  const emailQueue = createFakeQueue();
  const app = buildApp({ authService, projectService, taskService, emailQueue });

  const registerRes = await request(app).post('/auth/register').send({
    email: 'admin@acme.com',
    password: 'Password123!',
    name: 'Admin',
    organizationName: 'Acme',
  });
  const token = registerRes.body.accessToken as string;
  const orgId = registerRes.body.orgId ?? undefined;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Website Revamp' });

  return {
    app,
    token,
    authRepo,
    emailQueue,
    projectId: projectRes.body.id as string,
    orgId: projectRes.body.orgId as string,
  };
}

describe('Task routes', () => {
  it('creates and lists tasks nested under a project, with the pagination envelope', async () => {
    const { app, token, projectId } = await freshAppWithProject();
    const createRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Design homepage' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('todo');

    const listRes = await request(app)
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('rejects task creation under a project belonging to a different org (403)', async () => {
    const { app, projectId } = await freshAppWithProject();
    const otherRegister = await request(app).post('/auth/register').send({
      email: 'other@globex.com',
      password: 'Password123!',
      name: 'Other',
      organizationName: 'Globex',
    });
    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${otherRegister.body.accessToken}`)
      .send({ title: 'Should fail' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('filters tasks by status and priority via query params', async () => {
    const { app, token, projectId } = await freshAppWithProject();
    await request(app).post(`/projects/${projectId}/tasks`).set('Authorization', `Bearer ${token}`).send({
      title: 'Urgent bug', status: 'in_progress', priority: 'urgent',
    });
    await request(app).post(`/projects/${projectId}/tasks`).set('Authorization', `Bearer ${token}`).send({
      title: 'Low priority chore', status: 'todo', priority: 'low',
    });

    const res = await request(app)
      .get(`/projects/${projectId}/tasks?status=in_progress&priority=urgent`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].title).toBe('Urgent bug');
  });

  it('GET /tasks/:id returns 404 for unknown, 403 for cross-org', async () => {
    const { app, token, projectId } = await freshAppWithProject();
    const createRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task' });
    const taskId = createRes.body.id;

    const notFound = await request(app).get('/tasks/nope').set('Authorization', `Bearer ${token}`);
    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe('TASK_NOT_FOUND');

    const otherRegister = await request(app).post('/auth/register').send({
      email: 'other2@globex.com',
      password: 'Password123!',
      name: 'Other',
      organizationName: 'Globex',
    });
    const forbidden = await request(app)
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${otherRegister.body.accessToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('PATCH /tasks/:id updates fields; DELETE soft-deletes (subsequent GET 404s)', async () => {
    const { app, token, projectId } = await freshAppWithProject();
    const createRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Original title' });
    const taskId = createRes.body.id;

    const updateRes = await request(app)
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'done' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('done');

    const deleteRes = await request(app).delete(`/tasks/${taskId}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/tasks/${taskId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('assigns a same-org user to a task (201), rejects a cross-org user (400)', async () => {
    const { app, token, projectId, orgId, authRepo } = await freshAppWithProject();
    const createRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Assign me' });
    const taskId = createRes.body.id;

    // Seed a second real user into the SAME org (no invite endpoint exists —
    // see the fake repo's seedMembership note).
    authRepo.seedMembership('teammate_1', 'teammate@acme.com', orgId, 'member');

    const assignRes = await request(app)
      .post(`/tasks/${taskId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'teammate_1' });
    expect(assignRes.status).toBe(201);

    // A user from a different org must be rejected.
    authRepo.seedMembership('outsider_1', 'outsider@globex.com', 'globex_org', 'member');
    const rejectRes = await request(app)
      .post(`/tasks/${taskId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'outsider_1' });
    expect(rejectRes.status).toBe(400);
    expect(rejectRes.body.code).toBe('INVALID_ASSIGNEE');
  });

  it('unassigns a user (204); unassigning again returns 404', async () => {
    const { app, token, projectId, orgId, authRepo } = await freshAppWithProject();
    const createRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Assign me' });
    const taskId = createRes.body.id;

    authRepo.seedMembership('teammate_2', 'teammate2@acme.com', orgId, 'member');
    await request(app)
      .post(`/tasks/${taskId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'teammate_2' });

    const unassignRes = await request(app)
      .delete(`/tasks/${taskId}/assignments/teammate_2`)
      .set('Authorization', `Bearer ${token}`);
    expect(unassignRes.status).toBe(204);

    const secondUnassign = await request(app)
      .delete(`/tasks/${taskId}/assignments/teammate_2`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondUnassign.status).toBe(404);
    expect(secondUnassign.body.code).toBe('ASSIGNMENT_NOT_FOUND');
  });

  it('rejects an invalid create body with 400 VALIDATION_ERROR', async () => {
    const { app, token, projectId } = await freshAppWithProject();
    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'missing required title' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /jobs/:id maps queue states to the required pending/active/completed/failed values', async () => {
    const { app, token, emailQueue } = await freshAppWithProject();
    emailQueue.seed('job_done', 'completed', { taskId: 't1' });
    emailQueue.seed('job_running', 'active');
    emailQueue.seed('job_waiting', 'waiting');
    emailQueue.seed('job_delayed', 'delayed'); // mid-backoff retry — should map to "pending"
    emailQueue.seed('job_dead', 'failed', { taskId: 't2' });

    const cases: Array<[string, string]> = [
      ['job_done', 'completed'],
      ['job_running', 'active'],
      ['job_waiting', 'pending'],
      ['job_delayed', 'pending'],
      ['job_dead', 'failed'],
    ];
    for (const [id, expected] of cases) {
      const res = await request(app).get(`/jobs/${id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(expected);
      expect(res.body.id).toBe(id);
    }
  });

  it('GET /jobs/:id returns 404 for an unknown job id', async () => {
    const { app, token } = await freshAppWithProject();
    const res = await request(app).get('/jobs/does-not-exist').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('JOB_NOT_FOUND');
  });
});