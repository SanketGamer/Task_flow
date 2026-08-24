import { NotificationQueue } from '../../../src/types/shared.types';

export function createFakeNotificationQueue(opts: { shouldFail?: boolean } = {}) {
  const enqueued: Array<{ taskId: string; taskTitle: string; assigneeUserId: string }> = [];
  const queue: NotificationQueue = {
    async enqueueAssignmentEmail(data) {
      if (opts.shouldFail) {
        throw new Error('simulated enqueue failure');
      }
      enqueued.push(data);
      return { jobId: `fake_job_${enqueued.length}` };
    },
  };
  return { queue, enqueued };
}