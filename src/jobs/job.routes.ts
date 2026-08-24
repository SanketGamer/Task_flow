import { Router } from 'express';
import { authGuard } from '../middleware/authGuard';
import { createJobController, QueueLike } from './job.controller';

export function createJobRouter(queue: QueueLike) {
  const router = Router();
  router.use(authGuard);
  router.get('/:id', createJobController(queue));
  return router;
}