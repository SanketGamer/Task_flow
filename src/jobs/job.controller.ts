import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export interface JobLike {
  id?: string;
  attemptsMade: number;
  data: unknown;
  failedReason?: string;
  timestamp: number;
  getState(): Promise<string>;
}

export interface QueueLike {
  getJob(id: string): Promise<JobLike | null | undefined>;
}

function mapState(state: string): 'pending' | 'active' | 'completed' | 'failed' {
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'active') return 'active';
  return 'pending';
}

export function createJobController(queue: QueueLike) {
  return async function getJobById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const job = await queue.getJob(id);
      if (!job) {
        throw new AppError(404, 'Job not found', 'JOB_NOT_FOUND');
      }
      const state = await job.getState();
      res.status(200).json({
        id: job.id,
        status: mapState(state),
        attemptsMade: job.attemptsMade,
        data: job.data,
        failedReason: job.failedReason ?? null,
        createdAt: new Date(job.timestamp).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}