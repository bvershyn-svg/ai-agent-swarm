// Маршруты контент-фабрики: черновики и контент-план
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { publishToChannel } from '../notify';
import type { ContentDraft, ContentPlanItem } from '@swarm/shared';

export const contentRouter = Router();

// ── Черновики ─────────────────────────────────────────────────────────────

// GET /api/content/drafts — черновики (фильтр по проекту)
contentRouter.get('/drafts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<ContentDraft>(
      'SELECT * FROM content_drafts WHERE ($1::int IS NULL OR project_id = $1) ORDER BY created_at DESC',
      [req.projectId ?? null],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/content/drafts — создать черновик вручную
contentRouter.post('/drafts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, content, platform = 'general' } = req.body as {
      title?: string; content?: string; platform?: string;
    };
    if (!content?.trim()) { res.status(400).json({ error: 'Поле content обязательно' }); return; }

    const { rows } = await pool.query<ContentDraft>(
      'INSERT INTO content_drafts (title, content, platform, project_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title?.trim() || 'Черновик', content.trim(), platform, req.projectId || null],
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/content/drafts/:id — обновить черновик
contentRouter.patch('/drafts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { title, content, platform, status } = req.body as Record<string, string>;
    const fields: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [id];
    let i = 2;
    if (title)    { fields.push(`title    = $${i++}`); vals.push(title); }
    if (content)  { fields.push(`content  = $${i++}`); vals.push(content); }
    if (platform) { fields.push(`platform = $${i++}`); vals.push(platform); }
    if (status)   { fields.push(`status   = $${i++}`); vals.push(status); }

    const { rows } = await pool.query<ContentDraft>(
      `UPDATE content_drafts SET ${fields.join(', ')} WHERE id=$1 RETURNING *`,
      vals,
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/content/drafts/:id/publish-telegram — опубликовать в Telegram-канал
contentRouter.post('/drafts/:id/publish-telegram', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows } = await pool.query<ContentDraft>('SELECT * FROM content_drafts WHERE id=$1', [id]);
    if (!rows.length) { res.status(404).json({ error: 'Черновик не найден' }); return; }

    const draft = rows[0];
    const text = draft.title ? `*${draft.title}*\n\n${draft.content}` : draft.content;
    const published = await publishToChannel(text);

    if (!published) {
      res.status(503).json({ error: 'TELEGRAM_CHANNEL_ID не задан — канал не настроен' });
      return;
    }

    await pool.query(
      `UPDATE content_drafts SET status = 'published', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    res.json({ ok: true, message: 'Опубликовано в Telegram-канал' });
  } catch (e) { next(e); }
});

// DELETE /api/content/drafts/:id — удалить черновик
contentRouter.delete('/drafts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }
    await pool.query('DELETE FROM content_drafts WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Контент-план ──────────────────────────────────────────────────────────

// GET /api/content/plan — контент-план (фильтр по проекту)
contentRouter.get('/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<ContentPlanItem & { draft_content?: string }>(
      `SELECT cp.*, cd.content AS draft_content
       FROM content_plan cp
       LEFT JOIN content_drafts cd ON cd.id = cp.draft_id
       WHERE ($1::int IS NULL OR cp.project_id = $1)
       ORDER BY cp.scheduled_at ASC NULLS LAST, cp.created_at ASC`,
      [req.projectId ?? null],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/content/plan — добавить позицию в план
contentRouter.post('/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, platform = 'general', scheduled_at, draft_id, notes } = req.body as {
      title?: string; platform?: string; scheduled_at?: string; draft_id?: number; notes?: string;
    };
    if (!title?.trim()) { res.status(400).json({ error: 'Поле title обязательно' }); return; }

    const { rows } = await pool.query<ContentPlanItem>(
      `INSERT INTO content_plan (title, platform, scheduled_at, draft_id, notes, project_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title.trim(), platform, scheduled_at || null, draft_id || null, notes || null, req.projectId || null],
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/content/plan/:id — обновить позицию
contentRouter.patch('/plan/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { title, platform, scheduled_at, status, notes } = req.body as Record<string, string>;
    const fields: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [id];
    let i = 2;
    if (title)        { fields.push(`title        = $${i++}`); vals.push(title); }
    if (platform)     { fields.push(`platform     = $${i++}`); vals.push(platform); }
    if (scheduled_at !== undefined) { fields.push(`scheduled_at = $${i++}`); vals.push(scheduled_at || null); }
    if (status)       { fields.push(`status       = $${i++}`); vals.push(status); }
    if (notes !== undefined)  { fields.push(`notes        = $${i++}`); vals.push(notes || null); }

    const { rows } = await pool.query<ContentPlanItem>(
      `UPDATE content_plan SET ${fields.join(', ')} WHERE id=$1 RETURNING *`,
      vals,
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/content/plan/:id — удалить позицию из плана
contentRouter.delete('/plan/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }
    await pool.query('DELETE FROM content_plan WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
