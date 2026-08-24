import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';


// verify the token correct or not
export function authGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or malformed Authorization header', 'UNAUTHENTICATED'));
  }
  try {
    req.auth = verifyAccessToken(header.slice(7)); //remove the 1st 7ch character and return the token
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired access token', 'INVALID_TOKEN'));
  }
}
