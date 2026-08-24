export type OrgRole = 'org_admin' | 'member';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
}

export interface OrgMembershipRecord {
  orgId: string;
  role: OrgRole;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Port: everything the auth service needs from persistence, independent of Prisma.
// A real implementation (Prisma-backed) and a fake (in-memory, for tests) both
// satisfy this same contract(set of rules must be follow).
export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUserWithOrg(input: {
    email: string;
    passwordHash: string;
    name: string;
    organizationName: string;
  }): Promise<{ user: UserRecord; orgId: string; role: OrgRole }>;
  findMembership(userId: string): Promise<OrgMembershipRecord | null>;
  saveRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;
}