import bcrypt from 'bcrypt';
import { AuthRepository, OrgRole } from '../../types/auth.types';
import { signAccessToken } from '../../utils/jwt';
import { generateRefreshToken, hashToken } from '../../utils/tokens';
import { AppError } from '../../utils/AppError';
import { env } from '../../config/env';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAuthService(repo: AuthRepository) {

  //generate 2 tokens(access(JWT),refresh token(random hash string))
  async function issueTokenPair(userId: string, orgId: string, role: OrgRole) {
    const accessToken = signAccessToken({ sub: userId, orgId, role });
    const rawRefreshToken = generateRefreshToken();
    await repo.saveRefreshToken({
      userId,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken: rawRefreshToken };
  }


  //signup logic -> go to issueTokenPair return userid,orgid,role
  async function register(input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) {
    const existing = await repo.findUserByEmail(input.email);
    if (existing) {
      throw new AppError(409, 'Email is already registered', 'EMAIL_TAKEN');
    }
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);
    const { user, orgId, role } = await repo.createUserWithOrg({
      email: input.email,
      passwordHash,
      name: input.name,
      organizationName: input.organizationName,
    });
    return issueTokenPair(user.id, orgId, role);
  }


  //logic logic -> 
  async function login(input: { email: string; password: string }) {
    const user = await repo.findUserByEmail(input.email);
    // Same error for "no such user" and "wrong password" — prevents
    // an attacker from using the login endpoint to enumerate valid emails.
    if (!user) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const membership = await repo.findMembership(user.id);
    if (!membership) {
      throw new AppError(403, 'User has no organization membership', 'NO_ORG_MEMBERSHIP');
    }
    return issueTokenPair(user.id, membership.orgId, membership.role);
  }

  //refresh token
  async function refresh(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const record = await repo.findRefreshTokenByHash(tokenHash);
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
    // Rotation (bonus requirement): the presented token is immediately revoked
    // and a brand new pair is issued. If a stolen token is ever replayed after
    // the legitimate client has already rotated it, the replay fails outright.
    await repo.revokeRefreshToken(record.id);
    const membership = await repo.findMembership(record.userId);
    if (!membership) {
      throw new AppError(403, 'User has no organization membership', 'NO_ORG_MEMBERSHIP');
    }
    return issueTokenPair(record.userId, membership.orgId, membership.role);
  }

  //logout func
  async function logout(rawToken: string, allDevices: boolean, requesterId?: string) {
    if (allDevices) {
      if (!requesterId) {
        throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
      }
      await repo.revokeAllRefreshTokensForUser(requesterId);
      return;
    }
    const tokenHash = hashToken(rawToken);
    const record = await repo.findRefreshTokenByHash(tokenHash);
    // Logging out with an already-invalid token is not an error — logout
    // should always feel safe to call, never throw a scary response.
    if (record && !record.revokedAt) {
      await repo.revokeRefreshToken(record.id);
    }
  }

  return { register, login, refresh, logout };


}

export type AuthService = ReturnType<typeof createAuthService>;