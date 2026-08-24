import { OrgRole } from './auth.types';

// Used by TaskService to verify an assignee's org, without depending on
// the full AuthRepository surface. AuthRepository (and its Prisma-backed
// implementation) already satisfies this shape structurally.
export interface MembershipLookup {
  findMembership(userId: string): Promise<{ orgId: string; role: OrgRole } | null>;
}

export interface NotificationQueue {
  enqueueAssignmentEmail(data: {
    taskId: string;
    taskTitle: string;
    assigneeUserId: string;
  }): Promise<{ jobId: string }>;
}