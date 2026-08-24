import { Queue } from 'bullmq';
import { env } from '../../config/env';

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

export interface AssignmentEmailJobData {
  taskId: string;
  taskTitle: string;
  assigneeUserId: string;
}

export const emailQueue = new Queue<AssignmentEmailJobData>('email-notifications', {
  connection,
  defaultJobOptions: {
    // attempts: 4 = 1 initial try + 3 retries, matching "retry 3 times".
    // BullMQ's exponential backoff = delay * 2^(attemptsMade-1), so with
    // delay=1000 the retry gaps are 1s, 2s, 4s exactly as specified.
    attempts: 4,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: false, // keep failed jobs so GET /jobs/:id can report them
  },
});

export async function enqueueAssignmentEmail(data: AssignmentEmailJobData) {
  const job = await emailQueue.add('assignment-notification', data);
  return { jobId: job.id! };
}