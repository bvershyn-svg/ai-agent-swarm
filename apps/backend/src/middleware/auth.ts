// Опциональная защита дашборда паролем
// Если SWARM_PASSWORD не задан — авторизация выключена
import { Request, Response, NextFunction } from 'express';
import { env } from '../env';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!env.SWARM_PASSWORD) { next(); return; }

  const auth = req.headers.authorization ?? '';
  if (auth === `Bearer ${env.SWARM_PASSWORD}`) { next(); return; }

  res.status(401).json({ error: 'Требуется пароль', password_required: true });
}

// Эндпоинт для проверки: нужен ли пароль
export function authStatus(_req: Request, res: Response): void {
  res.json({ password_required: !!env.SWARM_PASSWORD });
}
