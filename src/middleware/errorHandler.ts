import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', details: {} });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND', details: { path: req.originalUrl } });
}