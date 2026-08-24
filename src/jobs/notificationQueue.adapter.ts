import { NotificationQueue } from '../types/shared.types';
import { enqueueAssignmentEmail } from './queues/email.queue';

export const bullmqNotificationQueue: NotificationQueue = {
  enqueueAssignmentEmail,
};