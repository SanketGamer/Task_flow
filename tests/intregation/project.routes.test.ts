import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createFakeAuthRepository } from '../unit/fakes/auth.repository.fake';
import { createProjectService } from '../../src/modules/projects/project.service';
import { createFakeProjectRepository } from '../unit/fakes/project.repository.fake';
import { signAccessToken } from '../../src/utils/jwt';

async function freshAppWithUser() {
  const authService = createAuthService(createFakeAuthRepository());
  const projectService = createProjectService(createFakeProjectRepository());
  const app = buildApp({ authService, projectService });

  const registerRes = await request(app).post('/auth/register').send({
    email: 'admin@acme.com',
    password: 'Password123!',
    name: 'Admin',
    organizationName: 'Acme',
  });
  return { app, token: registerRes.body.accessToken as string };
}

describe('Project routes', () => {
  it('rejects requests without a valid access token', async () => {
    const { app } = await freshAppWithUser();
    const res = await request(app).get('/projects');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('creates and lists a project scoped to the org, with the required pagination envelope', async () => {
    const { app, token } = await freshAppWithUser();
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Website Revamp' });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/projects').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(listRes.body.data[0].name).toBe('Website Revamp');
  });

  it('returns 404 for a project id that does not exist', async () => {
    const { app, token } = await freshAppWithUser();
    const res = await request(app).get('/projects/nope').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 403 (not 404) for a project belonging to a different org, with no data leaked', async () => {
    const { app, token } = await freshAppWithUser();
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Confidential' });
    const projectId = createRes.body.id;

    // A second, real registration against the SAME app instance — different org.
    const otherRegister = await request(app).post('/auth/register').send({
      email: 'other@globex.com',
      password: 'Password123!',
      name: 'Other',
      organizationName: 'Globex',
    });

    const res = await request(app)
      .get(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${otherRegister.body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body).not.toHaveProperty('name');
  });

  it('a "member" role gets 403 ADMIN_REQUIRED on delete; org_admin succeeds with 204', async () => {
    const { app, token } = await freshAppWithUser(); // registrant is org_admin
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delete Me' });
    const { id: projectId, orgId } = createRes.body;

    // Mint a same-org token with role "member" to exercise the RBAC branch
    // at the HTTP layer (the branch itself is already unit-tested).
    const memberToken = signAccessToken({ sub: 'member_user', orgId, role: 'member' });

    const forbidden = await request(app)
      .delete(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('ADMIN_REQUIRED');

    const deleted = await request(app)
      .delete(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(204);

    const getRes = await request(app).get(`/projects/${projectId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('GET /projects/:id/dashboard returns status counts', async () => {
    const { app, token } = await freshAppWithUser();
    const createRes = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dash Project' });

    const res = await request(app)
      .get(`/projects/${createRes.body.id}/dashboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, review: 0, done: 0 });
  });

  it('rejects an invalid create body with 400 VALIDATION_ERROR', async () => {
    const { app, token } = await freshAppWithUser();
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'missing the required name field' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});