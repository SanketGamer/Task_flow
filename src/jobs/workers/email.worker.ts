import { Worker, Queue } from 'bullmq';
import { env } from '../../config/env';
import { AssignmentEmailJobData } from '../queues/email.queue';

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

export const deadLetterQueue = new Queue('email-notifications-dlq', { connection });

// Mock email sending, per spec ("Mock email sending is acceptable").
async function sendMockEmail(data: AssignmentEmailJobData) {
  console.log(`[email] Notifying user ${data.assigneeUserId} — assigned to task "${data.taskTitle}" (${data.taskId})`);
}

export function startEmailWorker() {
  const worker = new Worker<AssignmentEmailJobData>(
    'email-notifications',
    async (job) => {
      await sendMockEmail(job.data);
    },
    { connection }
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    // Only after ALL retries are exhausted — not on every individual failure.
    if (job.attemptsMade >= attempts) {
      await deadLetterQueue.add('failed-email', {
        originalJobId: job.id,
        data: job.data,
        error: err.message,
        failedAt: new Date().toISOString(),
      });
      console.error(`[email] Job ${job.id} exhausted ${attempts} attempts — moved to dead-letter queue`);
    }
  });

  return worker;
}