import { createProjectService } from '../../src/modules/projects/project.service';
import { createFakeProjectRepository } from './fakes/project.repository.fake';

function setup() {
  const repo = createFakeProjectRepository();
  const service = createProjectService(repo);
  return { repo, service };
}

const ORG_A = 'org_a';
const ORG_B = 'org_b';

describe('ProjectService', () => {
  it('creates a project scoped to the given org', async () => {
    const { service } = setup();
    const project = await service.create(ORG_A, { name: 'Website Revamp' });
    expect(project.orgId).toBe(ORG_A);
    expect(project.name).toBe('Website Revamp');
  });

  it('getByIdScoped returns the project when it belongs to the caller org', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Mobile App' });
    const fetched = await service.getByIdScoped(created.id, ORG_A);
    expect(fetched.id).toBe(created.id);
  });

  it('getByIdScoped throws 404 for an id that does not exist', async () => {
    const { service } = setup();
    await expect(service.getByIdScoped('nope', ORG_A)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('getByIdScoped throws 403 (not 404) for a project belonging to a different org, and leaks no fields', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Confidential Project', description: 'secret roadmap' });

    let caught: any;
    try {
      await service.getByIdScoped(created.id, ORG_B);
    } catch (err) {
      caught = err;
    }

    expect(caught.statusCode).toBe(403);
    expect(caught.code).toBe('FORBIDDEN');
    // The error itself must not carry the project's name/description/etc.
    expect(JSON.stringify(caught)).not.toContain('Confidential Project');
    expect(JSON.stringify(caught)).not.toContain('secret roadmap');
  });

  it('list only returns projects belonging to the caller org', async () => {
    const { service } = setup();
    await service.create(ORG_A, { name: 'A1' });
    await service.create(ORG_A, { name: 'A2' });
    await service.create(ORG_B, { name: 'B1' });

    const result = await service.list(ORG_A, 0, 20);
    expect(result.total).toBe(2);
    expect(result.items.every((p) => p.orgId === ORG_A)).toBe(true);
  });

  it('update rejects cross-tenant attempts with 403', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Original' });
    await expect(
      service.update(created.id, ORG_B, { name: 'Hijacked' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('update succeeds for the owning org', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Original' });
    const updated = await service.update(created.id, ORG_A, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('remove rejects a "member" role with 403 ADMIN_REQUIRED', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Delete Me' });
    await expect(
      service.remove(created.id, ORG_A, 'member')
    ).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_REQUIRED' });
  });

  it('remove succeeds for org_admin and soft-deletes (excluded from list afterward)', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Delete Me' });
    await service.remove(created.id, ORG_A, 'org_admin');

    const result = await service.list(ORG_A, 0, 20);
    expect(result.items.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('remove still enforces org scoping even for an admin of a different org', async () => {
    const { service } = setup();
    const created = await service.create(ORG_A, { name: 'Protected' });
    await expect(
      service.remove(created.id, ORG_B, 'org_admin')
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});