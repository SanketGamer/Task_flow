import { startEmailWorker } from '../workers/email.worker';

const worker = startEmailWorker();
console.log('Email worker started, listening for jobs on "email-notifications"...');

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});