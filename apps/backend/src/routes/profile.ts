// Профиль проекта — CRUD
import { Router, Request, Response, NextFunction } from 'express';
import { getProfile, updateProfile } from '../profile';

export const profileRouter = Router();

// GET /api/profile — получить профиль текущего проекта
profileRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.projectId) {
      res.status(400).json({ error: 'Проект не указан (заголовок X-Project)' });
      return;
    }
    const profile = await getProfile(req.projectId);
    res.json(profile ?? {
      project_id: req.projectId, business: '', audience: '',
      products: '', tone: '', taboo: '', examples: '',
    });
  } catch (e) { next(e); }
});

// PATCH /api/profile — обновить профиль
profileRouter.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.projectId) {
      res.status(400).json({ error: 'Проект не указан (заголовок X-Project)' });
      return;
    }
    const updated = await updateProfile(req.projectId, req.body as Record<string, string>);
    res.json(updated);
  } catch (e) { next(e); }
});
