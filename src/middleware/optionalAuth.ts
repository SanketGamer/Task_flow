import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

//attach the authenticated user to req.auth; but whether the token is missing or invalid, don't block the request
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.auth = verifyAccessToken(header.slice(7));
    } catch {
      // ignore — this middleware never blocks the request
    }
  }
  next();
}