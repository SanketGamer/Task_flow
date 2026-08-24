import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import openapiSpec from './docs/openapi.json';
import { AuthService } from './modules/auth/auth.service';
import { createAuthRouter } from './modules/auth/auth.routes';
import { ProjectService } from './modules/projects/project.service';
import { createProjectRouter } from './modules/projects/project.routes';
import { TaskService } from './modules/tasks/task.service';
import { createProjectTaskRouter, createTaskRouter } from './modules/tasks/task.routes';
import { createJobRouter } from './jobs/job.routes';
import { QueueLike } from './jobs/job.controller';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export interface AppDependencies {
  authService: AuthService;
  projectService: ProjectService;
  taskService: TaskService;
  emailQueue: QueueLike;
}

export function buildApp(deps: AppDependencies) {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  app.use('/auth', createAuthRouter(deps.authService));
  // Nested task routes mounted before /projects — defensive ordering,
  // though their paths don't actually overlap.
  app.use('/projects/:projectId/tasks', createProjectTaskRouter(deps.taskService));
  app.use('/projects', createProjectRouter(deps.projectService));
  app.use('/tasks', createTaskRouter(deps.taskService));
  app.use('/jobs', createJobRouter(deps.emailQueue));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}