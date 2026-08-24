import { MembershipLookup } from '../../../src/types/shared.types';
import { OrgRole } from '../../../src/types/auth.types';

export function createFakeMembershipLookup(
  memberships: Record<string, { orgId: string; role: OrgRole }>
): MembershipLookup {
  return {
    async findMembership(userId) {
      return memberships[userId] ?? null;
    },
  };
}