import { Request, Response, NextFunction } from 'express';
import { TaskService } from './task.service';
import {
  createTaskSchema,
  updateTaskSchema,
  taskFilterQuerySchema,
  assignUserSchema,
} from '../../validators/task.validators';
import { parsePaginationParams, toSkipTake, buildPaginationResult } from '../../utils/pagination';

function param(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function createTaskController(service: TaskService) {
  async function create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createTaskSchema.parse(req.body);
      const task = await service.create(param(req, 'projectId'), req.auth!.orgId, {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      });
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  }

  async function list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = taskFilterQuerySchema.parse(req.query);
      const pagination = parsePaginationParams(query);
      const { skip, take } = toSkipTake(pagination);
      const { items, total } = await service.list(
        param(req, 'projectId'),
        req.auth!.orgId,
        {
          status: query.status,
          priority: query.priority,
          assigneeId: query.assignee,
          dueFrom: query.dueFrom ? new Date(query.dueFrom) : undefined,
          dueTo: query.dueTo ? new Date(query.dueTo) : undefined,
        },
        skip,
        take
      );
      res.status(200).json(buildPaginationResult(items, total, pagination));
    } catch (err) {
      next(err);
    }
  }

  async function getById(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await service.getByIdScoped(param(req, 'id'), req.auth!.orgId);
      res.status(200).json(task);
    } catch (err) {
      next(err);
    }
  }

  async function update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateTaskSchema.parse(req.body);
      const task = await service.update(param(req, 'id'), req.auth!.orgId, {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      });
      res.status(200).json(task);
    } catch (err) {
      next(err);
    }
  }

  async function remove(req: Request, res: Response, next: NextFunction) {
    try {
      await service.remove(param(req, 'id'), req.auth!.orgId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async function assign(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = assignUserSchema.parse(req.body);
      const assignment = await service.assignUser(param(req, 'id'), req.auth!.orgId, userId);
      res.status(201).json(assignment);
    } catch (err) {
      next(err);
    }
  }

  async function unassign(req: Request, res: Response, next: NextFunction) {
    try {
      await service.unassignUser(param(req, 'id'), req.auth!.orgId, param(req, 'userId'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  return { create, list, getById, update, remove, assign, unassign };
}