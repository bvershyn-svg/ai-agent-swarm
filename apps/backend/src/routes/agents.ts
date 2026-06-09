import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { getHandler } from '../agents/handlers';
import type { Agent, SendMessageRequest } from '@swarm/shared';

export const agentsRouter = Router();

// GET /api/agents — список всех активных агентов
agentsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<Agent>(
      'SELECT * FROM agents WHERE is_active = TRUE ORDER BY id ASC',
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/agents/:slug/history — история чата (изолирована по проекту)
agentsRouter.get('/:slug/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: agents } = await pool.query<Agent>(
      'SELECT * FROM agents WHERE slug = $1 AND is_active = TRUE',
      [req.params.slug],
    );
    if (!agents.length) { res.status(404).json({ error: 'Агент не найден' }); return; }

    const projectId = req.projectId;
    const { rows } = await pool.query(
      `SELECT * FROM chat_messages
       WHERE agent_id = $1
         AND (project_id = $2 OR ($2::int IS NULL AND project_id IS NULL))
       ORDER BY created_at ASC`,
      [agents[0].id, projectId],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/agents/:slug/chat — отправить сообщение (с контекстом проекта)
agentsRouter.post('/:slug/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body as SendMessageRequest;
    if (!message?.trim()) { res.status(400).json({ error: 'Сообщение не может быть пустым' }); return; }

    const { rows: agents } = await pool.query<Agent>(
      'SELECT * FROM agents WHERE slug = $1 AND is_active = TRUE',
      [req.params.slug],
    );
    if (!agents.length) { res.status(404).json({ error: 'Агент не найден' }); return; }

    const handle = getHandler(agents[0].slug);
    const result = await handle(agents[0], message.trim(), req.projectId ?? undefined);
    res.json(result);
  } catch (e) { next(e); }
});
