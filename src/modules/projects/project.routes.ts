import { Router } from 'express';
import { createProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { authGuard } from '../../middleware/authGuard';

export function createProjectRouter(service: ProjectService) {
  const router = Router();
  const controller = createProjectController(service);

  // Every project route requires a valid access token — orgId always
  // comes from req.auth, set here, never from params/body.
  router.use(authGuard);

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.get('/:id/dashboard', controller.dashboard);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}