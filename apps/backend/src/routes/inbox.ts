// Инбокс идей
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { planRun } from '../agents/orchestrator';
import type { IdeaInboxItem, Run } from '@swarm/shared';

export const inboxRouter = Router();

// GET /api/inbox — список идей (по проекту или все)
inboxRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<IdeaInboxItem>(
      `SELECT * FROM idea_inbox
       WHERE ($1::int IS NULL OR project_id = $1)
       ORDER BY created_at DESC`,
      [req.projectId ?? null],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/inbox — добавить идею
inboxRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, source = 'manual' } = req.body as { text?: string; source?: string };
    if (!text?.trim()) { res.status(400).json({ error: 'Поле text обязательно' }); return; }

    const { rows } = await pool.query<IdeaInboxItem>(
      'INSERT INTO idea_inbox (text, source, project_id) VALUES ($1, $2, $3) RETURNING *',
      [text.trim(), source, req.projectId ?? null],
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/inbox/:id/launch — превратить идею в прогон
inboxRouter.post('/:id/launch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows: items } = await pool.query<IdeaInboxItem>(
      'SELECT * FROM idea_inbox WHERE id = $1',
      [id],
    );
    if (!items.length) { res.status(404).json({ error: 'Идея не найдена' }); return; }

    const idea = items[0];
    const { rows: runRows } = await pool.query<Run>(
      "INSERT INTO runs (goal, status, project_id) VALUES ($1, 'planning', $2) RETURNING *",
      [idea.text, idea.project_id],
    );
    const run = runRows[0];

    await pool.query(
      'UPDATE idea_inbox SET status=$1, run_id=$2 WHERE id=$3',
      ['in_progress', run.id, id],
    );

    res.json(run);

    planRun(run.id).catch((err: Error) => {
      console.error('Ошибка планирования идеи:', err.message);
      pool.query("UPDATE runs SET status='failed' WHERE id=$1", [run.id]).catch(() => {});
    });
  } catch (e) { next(e); }
});

// DELETE /api/inbox/:id — отклонить идею
inboxRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }
    await pool.query("UPDATE idea_inbox SET status='rejected' WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
