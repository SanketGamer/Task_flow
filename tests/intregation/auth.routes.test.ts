import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createFakeAuthRepository } from '../unit/fakes/auth.repository.fake';

function freshApp() {
  const repo = createFakeAuthRepository();
  const authService = createAuthService(repo);
  return buildApp({ authService });
}

describe('Auth routes', () => {
  it('POST /auth/register returns 201 with a token pair', async () => {
    const app = freshApp();
    const res = await request(app).post('/auth/register').send({
      email: 'alice@acme.com',
      password: 'Password123!',
      name: 'Alice',
      organizationName: 'Acme Inc',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('POST /auth/register with missing password returns 400 VALIDATION_ERROR', async () => {
    const app = freshApp();
    const res = await request(app).post('/auth/register').send({
      email: 'bad@acme.com',
      name: 'Bad',
      organizationName: 'Acme',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toBeTruthy();
    expect(res.body.details).toBeDefined();
  });

  it('POST /auth/login with correct credentials returns 200', async () => {
    const app = freshApp();
    await request(app).post('/auth/register').send({
      email: 'bob@acme.com',
      password: 'Password123!',
      name: 'Bob',
      organizationName: 'Acme',
    });
    const res = await request(app).post('/auth/login').send({
      email: 'bob@acme.com',
      password: 'Password123!',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('POST /auth/login with wrong password returns 401 with consistent error shape', async () => {
    const app = freshApp();
    await request(app).post('/auth/register').send({
      email: 'carol@acme.com',
      password: 'Password123!',
      name: 'Carol',
      organizationName: 'Acme',
    });
    const res = await request(app).post('/auth/login').send({
      email: 'carol@acme.com',
      password: 'WrongPass1',
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
      details: {},
    });
  });

  it('POST /auth/refresh rotates the token, and reusing the old one fails', async () => {
    const app = freshApp();
    const registerRes = await request(app).post('/auth/register').send({
      email: 'dave@acme.com',
      password: 'Password123!',
      name: 'Dave',
      organizationName: 'Acme',
    });
    const oldRefresh = registerRes.body.refreshToken;

    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken: oldRefresh });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refreshToken).not.toBe(oldRefresh);

    const reuseRes = await request(app).post('/auth/refresh').send({ refreshToken: oldRefresh });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('POST /auth/logout returns 204 and invalidates the refresh token', async () => {
    const app = freshApp();
    const registerRes = await request(app).post('/auth/register').send({
      email: 'erin@acme.com',
      password: 'Password123!',
      name: 'Erin',
      organizationName: 'Acme',
    });
    const refreshToken = registerRes.body.refreshToken;

    const logoutRes = await request(app).post('/auth/logout').send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('unknown routes return 404 with consistent error shape', async () => {
    const app = freshApp();
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rate limits /auth/login after 10 requests/minute from the same IP', async () => {
    const app = freshApp();
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@acme.com', password: 'whatever123' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});