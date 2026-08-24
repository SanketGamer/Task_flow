import { env } from './config/env';
import { buildApp } from './app';
import { prisma } from './config/db';
import { createPrismaAuthRepository } from './modules/auth/auth.repository.prisma';
import { createAuthService } from './modules/auth/auth.service';
import { createPrismaProjectRepository } from './modules/projects/project.repository.prisma';
import { createProjectService } from './modules/projects/project.service';
import { createPrismaTaskRepository } from './modules/tasks/task.repository.prisma';
import { createTaskService } from './modules/tasks/task.service';
import { bullmqNotificationQueue } from './jobs/notificationQueue.adapter';
import { emailQueue } from './jobs/queues/email.queue';

const authRepo = createPrismaAuthRepository(prisma);
const authService = createAuthService(authRepo);

const projectRepo = createPrismaProjectRepository(prisma);
const projectService = createProjectService(projectRepo);

const taskRepo = createPrismaTaskRepository(prisma);
// authRepo already implements MembershipLookup structurally — no new
// repository needed just to check an assignee's org.
const taskService = createTaskService(taskRepo, projectRepo, authRepo, bullmqNotificationQueue);

const app = buildApp({ authService, projectService, taskService, emailQueue });

app.listen(env.PORT, () => {
  console.log(`TaskFlow API listening on port ${env.PORT} [${env.NODE_ENV}]`);
});