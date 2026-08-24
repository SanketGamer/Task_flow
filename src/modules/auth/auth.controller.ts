import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from '../../validators/auth.validators';

export function createAuthController(service: AuthService) {

  
  async function register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = registerSchema.parse(req.body);
      const tokens = await service.register(input);
      res.status(201).json(tokens);
    } catch (err) {
      next(err);
    }
  }

  async function login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginSchema.parse(req.body);
      const tokens = await service.login(input);
      res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  }

  async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const input = refreshSchema.parse(req.body);
      const tokens = await service.refresh(input.refreshToken);
      res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  }

  async function logout(req: Request, res: Response, next: NextFunction) {
    try {
      const input = logoutSchema.parse(req.body);
      await service.logout(input.refreshToken, input.allDevices, req.auth?.sub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  return { register, login, refresh, logout };
}