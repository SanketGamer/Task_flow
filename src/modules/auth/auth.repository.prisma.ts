import { PrismaClient } from '@prisma/client';
import { AuthRepository } from '../../types/auth.types';

export function createPrismaAuthRepository(prisma: PrismaClient): AuthRepository {
  return {
    async findUserByEmail(email) {
      return prisma.user.findUnique({ where: { email } });
    },

    async createUserWithOrg({ email, passwordHash, name, organizationName }) {
      // Wrapped in a transaction: org, user, and membership must all succeed
      // together or none should exist — otherwise a failed step could leave
      // an orphaned org with no admin, or a user with no org membership.
      return prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: organizationName, slug: slugify(organizationName) },
        });
        const user = await tx.user.create({ data: { email, passwordHash, name } });
        await tx.orgMember.create({
          data: { userId: user.id, orgId: org.id, role: 'org_admin' },
        });
        return { user, orgId: org.id, role: 'org_admin' as const };
      });
    },

    async findMembership(userId) {
      const membership = await prisma.orgMember.findFirst({ where: { userId } });
      return membership ? { orgId: membership.orgId, role: membership.role } : null;
    },

    async saveRefreshToken({ userId, tokenHash, expiresAt }) {
      return prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
    },

    async findRefreshTokenByHash(tokenHash) {
      return prisma.refreshToken.findUnique({ where: { tokenHash } });
    },

    async revokeRefreshToken(id) {
      await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    },

    async revokeAllRefreshTokensForUser(userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}

// organizations.slug is unique — two companies both named "Acme" would
// otherwise collide. A short random suffix keeps signup frictionless
// (no "name taken" retry step) while guaranteeing uniqueness.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}