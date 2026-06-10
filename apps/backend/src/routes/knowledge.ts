// Маршруты для базы знаний
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { chunkText } from '../knowledge';
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

// POST /api/knowledge/upload — загрузить текстовый материал напрямую из дашборда
knowledgeRouter.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, text, is_pinned } = req.body as { name?: string; text?: string; is_pinned?: boolean };
    if (!name?.trim() || !text?.trim()) {
      res.status(400).json({ error: 'Поля name и text обязательны' }); return;
    }
    if (!req.projectId) {
      res.status(400).json({ error: 'Укажите проект через заголовок X-Project' }); return;
    }
    const chunks = chunkText(text.trim(), 600, 80);
    // Заменяем если уже есть с таким же именем
    await pool.query('DELETE FROM knowledge_sources WHERE project_id=$1 AND name=$2', [req.projectId, name.trim()]);
    const { rows: [src] } = await pool.query<KnowledgeSource>(
      `INSERT INTO knowledge_sources (project_id, name, source_type, chunk_count, is_pinned)
       VALUES ($1, $2, 'upload', $3, $4) RETURNING *`,
      [req.projectId, name.trim(), chunks.length, is_pinned ?? false],
    );
    for (let i = 0; i < chunks.length; i++) {
      await pool.query(
        'INSERT INTO knowledge_chunks (source_id, project_id, content, metadata) VALUES ($1, $2, $3, $4)',
        [src.id, req.projectId, chunks[i], JSON.stringify({ chunk_index: i, total_chunks: chunks.length })],
      );
    }
    res.json({ source: src, chunk_count: chunks.length });
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

// PATCH /api/knowledge/:id — изменить флаг is_pinned (постоянный контекст или база знаний)
knowledgeRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { is_pinned } = req.body as { is_pinned?: boolean };
    if (is_pinned === undefined) { res.status(400).json({ error: 'is_pinned обязателен' }); return; }
    const { rows } = await pool.query<KnowledgeSource>(
      'UPDATE knowledge_sources SET is_pinned=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [is_pinned, id],
    );
    res.json(rows[0] ?? null);
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
