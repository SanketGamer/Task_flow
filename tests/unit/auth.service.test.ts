import { createAuthService } from '../../src/modules/auth/auth.service';
import { createFakeAuthRepository } from './fakes/auth.repository.fake';
import { verifyAccessToken } from '../../src/utils/jwt';

function setup() {
  const repo = createFakeAuthRepository();
  const service = createAuthService(repo);
  return { repo, service };
}

describe('AuthService', () => {
  it('registers a new user, creates an org, and issues a token pair with org_admin role', async () => {
    const { service } = setup();
    const { accessToken, refreshToken } = await service.register({
      email: 'alice@acme.com',
      password: 'Password123!',
      name: 'Alice',
      organizationName: 'Acme Inc',
    });
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    const payload = verifyAccessToken(accessToken);
    expect(payload.role).toBe('org_admin');
    expect(payload.orgId).toBeTruthy();
  });

  it('hashes the password with the configured bcrypt cost factor (>= 12)', async () => {
    const { service, repo } = setup();
    await service.register({
      email: 'costcheck@acme.com',
      password: 'Password123!',
      name: 'Cost Check',
      organizationName: 'Acme',
    });
    const user = await repo.findUserByEmail('costcheck@acme.com');
    // bcrypt hash format: $2b$<cost>$<salt+hash>
    const cost = Number(user!.passwordHash.split('$')[2]);
    expect(cost).toBeGreaterThanOrEqual(12);
  });

  it('rejects registration with a duplicate email', async () => {
    const { service } = setup();
    await service.register({
      email: 'dup@acme.com',
      password: 'Password123!',
      name: 'A',
      organizationName: 'Org',
    });
    await expect(
      service.register({
        email: 'dup@acme.com',
        password: 'Password123!',
        name: 'A2',
        organizationName: 'Org2',
      })
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });
  });

  it('logs in successfully with correct credentials', async () => {
    const { service } = setup();
    await service.register({
      email: 'bob@acme.com',
      password: 'Password123!',
      name: 'Bob',
      organizationName: 'Acme',
    });
    const { accessToken } = await service.login({ email: 'bob@acme.com', password: 'Password123!' });
    const payload = verifyAccessToken(accessToken);
    expect(payload.sub).toBeTruthy();
  });

  it('rejects login with the wrong password', async () => {
    const { service } = setup();
    await service.register({
      email: 'carol@acme.com',
      password: 'Password123!',
      name: 'Carol',
      organizationName: 'Acme',
    });
    await expect(
      service.login({ email: 'carol@acme.com', password: 'WrongPass1' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('rejects login for an unknown email with the SAME error as wrong password (no user enumeration)', async () => {
    const { service } = setup();
    await expect(
      service.login({ email: 'nobody@acme.com', password: 'whatever123' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('refresh issues a new token pair and rotates the old refresh token', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register({
      email: 'dave@acme.com',
      password: 'Password123!',
      name: 'Dave',
      organizationName: 'Acme',
    });
    const second = await service.refresh(refreshToken);
    expect(second.refreshToken).not.toBe(refreshToken);
  });

  it('rejects reuse of an already-rotated refresh token (replay protection)', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register({
      email: 'erin@acme.com',
      password: 'Password123!',
      name: 'Erin',
      organizationName: 'Acme',
    });
    await service.refresh(refreshToken); // rotates it
    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
      statusCode: 401,
    });
  });

  it('logout revokes the refresh token so it can no longer be used', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register({
      email: 'frank@acme.com',
      password: 'Password123!',
      name: 'Frank',
      organizationName: 'Acme',
    });
    await service.logout(refreshToken, false);
    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('logout is idempotent — calling it with an already-invalid token does not throw', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register({
      email: 'grace@acme.com',
      password: 'Password123!',
      name: 'Grace',
      organizationName: 'Acme',
    });
    await service.logout(refreshToken, false);
    await expect(service.logout(refreshToken, false)).resolves.toBeUndefined();
  });

  it('logout with allDevices revokes every refresh token for that user', async () => {
    const { service, repo } = setup();
    const { refreshToken: t1 } = await service.register({
      email: 'henry@acme.com',
      password: 'Password123!',
      name: 'Henry',
      organizationName: 'Acme',
    });
    const user = await repo.findUserByEmail('henry@acme.com');
    const { refreshToken: t2 } = await service.login({ email: 'henry@acme.com', password: 'Password123!' });

    await service.logout('', true, user!.id);

    await expect(service.refresh(t1)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    await expect(service.refresh(t2)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });
});