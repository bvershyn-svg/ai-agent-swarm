// Маршруты фабрики тестов
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import type { TestScenario, TestRun } from '@swarm/shared';

export const testsRouter = Router();

// GET /api/tests/scenarios — сценарии (фильтр по проекту)
testsRouter.get('/scenarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<TestScenario>(
      `SELECT * FROM test_scenarios
       WHERE ($1::int IS NULL OR project_id = $1)
       ORDER BY created_at ASC`,
      [req.projectId ?? null],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/tests/scenarios — создать сценарий вручную
testsRouter.post('/scenarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent_slug, name, prompt, expected } = req.body as {
      agent_slug?: string; name?: string; prompt?: string; expected?: string;
    };
    if (!agent_slug?.trim()) { res.status(400).json({ error: 'Поле agent_slug обязательно' }); return; }
    if (!name?.trim())       { res.status(400).json({ error: 'Поле name обязательно' }); return; }
    if (!prompt?.trim())     { res.status(400).json({ error: 'Поле prompt обязательно' }); return; }

    const { rows } = await pool.query<TestScenario>(
      `INSERT INTO test_scenarios (project_id, agent_slug, name, prompt, expected)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.projectId ?? null, agent_slug.trim(), name.trim(), prompt.trim(), expected?.trim() || null],
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/tests/scenarios/:id — удалить сценарий
testsRouter.delete('/scenarios/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }
    await pool.query('DELETE FROM test_scenarios WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/tests/runs — результаты запусков (с именем сценария)
testsRouter.get('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<TestRun & { scenario_name: string; agent_slug: string }>(
      `SELECT r.*, s.name AS scenario_name, s.agent_slug
       FROM test_runs r
       JOIN test_scenarios s ON s.id = r.scenario_id
       WHERE ($1::int IS NULL OR r.project_id = $1)
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [req.projectId ?? null],
    );
    res.json(rows);
  } catch (e) { next(e); }
});
