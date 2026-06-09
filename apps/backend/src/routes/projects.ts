// Управление проектами
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import type { Project } from '@swarm/shared';

export const projectsRouter = Router();

// GET /api/projects — список проектов
projectsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<Project>(
      'SELECT * FROM projects ORDER BY created_at ASC',
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/projects — создать проект
projectsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug, name, description = '', color = '#3B82F6' } = req.body as {
      slug?: string; name?: string; description?: string; color?: string;
    };

    if (!slug?.trim() || !name?.trim()) {
      res.status(400).json({ error: 'Поля slug и name обязательны' });
      return;
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const { rows } = await pool.query<Project>(
      'INSERT INTO projects (slug, name, description, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [cleanSlug, name.trim(), description.trim(), color],
    );

    // Создаём профиль для нового проекта
    await pool.query(
      'INSERT INTO project_profile (project_id) VALUES ($1) ON CONFLICT (project_id) DO NOTHING',
      [rows[0].id],
    );

    res.json(rows[0]);
  } catch (e) { next(e); }
});

// GET /api/projects/:slug
projectsRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<Project>(
      'SELECT * FROM projects WHERE slug = $1',
      [req.params.slug],
    );
    if (!rows.length) { res.status(404).json({ error: 'Проект не найден' }); return; }
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/projects/:slug — обновить проект
projectsRouter.patch('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, color } = req.body as {
      name?: string; description?: string; color?: string;
    };

    const fields: string[] = ['updated_at = NOW()'];
    const vals: unknown[]  = [req.params.slug];
    let i = 2;
    if (name?.trim())        { fields.push(`name        = $${i++}`); vals.push(name.trim()); }
    if (description != null) { fields.push(`description = $${i++}`); vals.push(description); }
    if (color?.trim())       { fields.push(`color       = $${i++}`); vals.push(color.trim()); }

    const { rows } = await pool.query<Project>(
      `UPDATE projects SET ${fields.join(', ')} WHERE slug = $1 RETURNING *`,
      vals,
    );
    if (!rows.length) { res.status(404).json({ error: 'Проект не найден' }); return; }
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/projects/:slug
projectsRouter.delete('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<Project>(
      'SELECT * FROM projects WHERE slug = $1',
      [req.params.slug],
    );
    if (!rows.length) { res.status(404).json({ error: 'Проект не найден' }); return; }

    const total = (await pool.query<{ count: string }>('SELECT COUNT(*) FROM projects')).rows[0].count;
    if (parseInt(total) <= 1) {
      res.status(400).json({ error: 'Нельзя удалить последний проект' });
      return;
    }

    await pool.query('DELETE FROM projects WHERE slug = $1', [req.params.slug]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
