import { Router } from 'express';
import { createTaskController } from './task.controller';
import { TaskService } from './task.service';
import { authGuard } from '../../middleware/authGuard';

// Mounted at /projects/:projectId/tasks — mergeParams so :projectId is visible here.
export function createProjectTaskRouter(service: TaskService) {
  const router = Router({ mergeParams: true });
  const controller = createTaskController(service);
  router.use(authGuard);
  router.post('/', controller.create);
  router.get('/', controller.list);
  return router;
}

// Mounted at /tasks — standalone task-level operations.
export function createTaskRouter(service: TaskService) {
  const router = Router();
  const controller = createTaskController(service);
  router.use(authGuard);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/assignments', controller.assign);
  router.delete('/:id/assignments/:userId', controller.unassign);
  return router;
}