import { Router } from 'express';
import { createAuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { createAuthRateLimiter } from '../../middleware/rateLimiter';
import { optionalAuth } from '../../middleware/optionalAuth';

export function createAuthRouter(service: AuthService) {
  const router = Router();
  const controller = createAuthController(service);

  // Applies to every /auth/* route — 10 req/min/IP per spec.
  router.use(createAuthRateLimiter());

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', optionalAuth, controller.logout);

  return router;
}