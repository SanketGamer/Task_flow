import { Request, Response, NextFunction } from 'express';

import { ProjectService } from './project.service';

import {createProjectSchema,updateProjectSchema} from '../../validators/project.validators';

import {parsePaginationParams,toSkipTake,buildPaginationResult,} from '../../utils/pagination';

export function createProjectController(service: ProjectService) {

  async function create(req: Request,res: Response,next: NextFunction) {
    try {
      const input = createProjectSchema.parse(req.body);

      const project = await service.create(req.auth!.orgId, input);

      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  }

  async function list(req: Request, res: Response,  next: NextFunction ) {
    try {
      const pagination = parsePaginationParams(req.query);

      const { skip, take } = toSkipTake(pagination);

      const { items, total } = await service.list(
        req.auth!.orgId,
        skip,
        take
      );

      res
        .status(200)
        .json(buildPaginationResult(items, total, pagination));
    } catch (err) {
      next(err);
    }
  }


  async function getById(req: Request<{ id: string }>,res: Response, next: NextFunction) {
    try {
      const project = await service.getByIdScoped(
        req.params.id,
        req.auth!.orgId
      );

      res.status(200).json(project);
    } catch (err) {
      next(err);
    }
  }

  async function update(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const input = updateProjectSchema.parse(req.body);

      const project = await service.update(
        req.params.id,
        req.auth!.orgId,
        input
      );

      res.status(200).json(project);
    } catch (err) {
      next(err);
    }
  }

  async function remove(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      await service.remove(
        req.params.id,
        req.auth!.orgId,
        req.auth!.role
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async function dashboard(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const counts = await service.dashboard(
        req.params.id,
        req.auth!.orgId
      );

      res.status(200).json(counts);
    } catch (err) {
      next(err);
    }
  }

  return {
    create,
    list,
    getById,
    update,
    remove,
    dashboard,
  };
}