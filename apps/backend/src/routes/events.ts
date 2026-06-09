// REST-маршруты для уведомлений (лента событий)
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { getUnreadEvents, getUnreadCount } from '../journal';
import type { SwarmEvent } from '@swarm/shared';

export const eventsRouter = Router();

// GET /api/events — список непрочитанных уведомлений
eventsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await getUnreadEvents();
    res.json(events);
  } catch (e) {
    next(e);
  }
});

// GET /api/events/count — количество непрочитанных (для счётчика в сайдбаре)
eventsRouter.get('/count', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await getUnreadCount();
    res.json({ count });
  } catch (e) {
    next(e);
  }
});

// POST /api/events/:id/read — прочитать одно уведомление
eventsRouter.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    await pool.query(
      'UPDATE events SET read_at=NOW() WHERE id=$1 AND read_at IS NULL',
      [id],
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/events/read-all — прочитать все уведомления
eventsRouter.post('/read-all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await pool.query('UPDATE events SET read_at=NOW() WHERE read_at IS NULL');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/events/all — все уведомления (включая прочитанные)
eventsRouter.get('/all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<SwarmEvent>(
      'SELECT * FROM events ORDER BY created_at DESC LIMIT 100',
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
