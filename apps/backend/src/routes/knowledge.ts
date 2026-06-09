// Маршруты для базы знаний
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import type { KnowledgeSource } from '@swarm/shared';

export const knowledgeRouter = Router();

// GET /api/knowledge — список источников для проекта
knowledgeRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<KnowledgeSource>(
      `SELECT * FROM knowledge_sources
       WHERE ($1::int IS NULL OR project_id = $1)
       ORDER BY created_at DESC`,
      [req.projectId],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/knowledge/:id/chunks — чанки источника
knowledgeRouter.get('/:id/chunks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { rows } = await pool.query(
      'SELECT id, content, metadata, created_at FROM knowledge_chunks WHERE source_id=$1 ORDER BY id ASC',
      [id],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// DELETE /api/knowledge/:id — удалить источник (чанки удалятся каскадно)
knowledgeRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query('DELETE FROM knowledge_sources WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
