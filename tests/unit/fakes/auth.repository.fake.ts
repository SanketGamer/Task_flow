import {
  AuthRepository,
  UserRecord,
  OrgMembershipRecord,
  RefreshTokenRecord,
} from '../../../src/types/auth.types';

export function createFakeAuthRepository(): AuthRepository {
  const usersByEmail = new Map<string, UserRecord>();
  const membershipsByUserId = new Map<string, OrgMembershipRecord>();
  const refreshTokens = new Map<string, RefreshTokenRecord>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_${++counter}`;

  return {
    async findUserByEmail(email) {
      return usersByEmail.get(email) ?? null;
    },

    async createUserWithOrg({ email, passwordHash, name, organizationName }) {
      const user: UserRecord = { id: nextId('user'), email, passwordHash, name };
      usersByEmail.set(email, user);
      const orgId = nextId('org');
      const role = 'org_admin' as const;
      membershipsByUserId.set(user.id, { orgId, role });
      void organizationName; // stored on the real Prisma-backed repo; irrelevant to fake
      return { user, orgId, role };
    },

    async findMembership(userId) {
      return membershipsByUserId.get(userId) ?? null;
    },

    async saveRefreshToken({ userId, tokenHash, expiresAt }) {
      const record: RefreshTokenRecord = {
        id: nextId('rt'),
        userId,
        tokenHash,
        expiresAt,
        revokedAt: null,
      };
      refreshTokens.set(record.id, record);
      return record;
    },

    async findRefreshTokenByHash(tokenHash) {
      for (const rt of refreshTokens.values()) {
        if (rt.tokenHash === tokenHash) return rt;
      }
      return null;
    },

    async revokeRefreshToken(id) {
      const rt = refreshTokens.get(id);
      if (rt) rt.revokedAt = new Date();
    },

    async revokeAllRefreshTokensForUser(userId) {
      for (const rt of refreshTokens.values()) {
        if (rt.userId === userId) rt.revokedAt = new Date();
      }
    },
  };
}