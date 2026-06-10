// REST-маршруты для прогонов роя
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { planRun, executeRun, launchSoloTask } from '../agents/orchestrator';
import { queue } from '../agents/queue';
import { getActivityLog } from '../journal';
import { notifyOwner, sendDocumentToOwner } from '../notify';
import { buildRunDocx } from '../docx';
import type { Run, Task } from '@swarm/shared';

export const runsRouter = Router();

// Определяет платформу по описанию задачи
function detectPlatform(text: string): string {
  const l = text.toLowerCase();
  if (l.includes('youtube') || l.includes('ютуб')) return 'youtube';
  if (l.includes('telegram') || l.includes('телеграм') || l.includes(' тг ')) return 'telegram';
  if (l.includes('instagram') || l.includes('инстаграм') || l.includes('reels') || l.includes('рилс')) return 'instagram';
  return 'general';
}

// POST /api/runs — создать новый прогон
runsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { goal, budget_usd } = req.body as { goal?: string; budget_usd?: number };
    if (!goal?.trim()) { res.status(400).json({ error: 'Поле goal обязательно' }); return; }

    const { rows } = await pool.query<Run>(
      "INSERT INTO runs (goal, status, budget_usd, project_id) VALUES ($1, 'planning', $2, $3) RETURNING *",
      [goal.trim(), budget_usd || null, req.projectId || null],
    );
    const run = rows[0];
    res.json(run);

    planRun(run.id).catch((err: Error) => {
      console.error('Ошибка планирования:', err.message);
      pool.query("UPDATE runs SET status='failed', updated_at=NOW() WHERE id=$1", [run.id]).catch(() => {});
    });
  } catch (e) { next(e); }
});

// GET /api/runs — список прогонов (фильтр по проекту)
runsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, COUNT(t.id)::int AS task_count
       FROM runs r LEFT JOIN tasks t ON t.run_id = r.id
       WHERE ($1::int IS NULL OR r.project_id = $1)
       GROUP BY r.id ORDER BY r.created_at DESC`,
      [req.projectId ?? null],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/runs/:id — прогон + задачи + журнал
runsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows: runRows } = await pool.query<Run>('SELECT * FROM runs WHERE id=$1', [runId]);
    if (!runRows.length) { res.status(404).json({ error: 'Прогон не найден' }); return; }

    const { rows: tasks } = await pool.query<Task>(
      'SELECT * FROM tasks WHERE run_id=$1 ORDER BY position ASC', [runId],
    );
    const activity = await getActivityLog(runId);
    res.json({ run: runRows[0], tasks, activity });
  } catch (e) { next(e); }
});

// POST /api/runs/:id/approve-plan — одобрить план и запустить
runsRouter.post('/:id/approve-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows } = await pool.query<Run>(
      "UPDATE runs SET status='running', updated_at=NOW() WHERE id=$1 AND status='awaiting_approval' RETURNING *",
      [runId],
    );
    if (!rows.length) { res.status(400).json({ error: 'Прогон не ожидает одобрения' }); return; }
    queue.schedule(runId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/runs/:id/reject-plan — отклонить план
runsRouter.post('/:id/reject-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }
    await pool.query("DELETE FROM runs WHERE id=$1 AND status='awaiting_approval'", [runId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/runs/:id/approve-result — владелец одобряет результат + auto-draft
runsRouter.post('/:id/approve-result', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows } = await pool.query<Run>(
      "UPDATE runs SET status='completed', updated_at=NOW() WHERE id=$1 AND status='awaiting_review' RETURNING *",
      [runId],
    );
    if (!rows.length) { res.status(400).json({ error: 'Прогон не ожидает проверки' }); return; }

    res.json({ ok: true });

    // Авто-создание черновиков из задач-публикаций (после ответа)
    const { rows: publisherTasks } = await pool.query<Task>(
      "SELECT * FROM tasks WHERE run_id=$1 AND agent_slug='publisher' AND result IS NOT NULL",
      [runId],
    );

    let draftCount = 0;
    for (const task of publisherTasks) {
      const platform = detectPlatform(task.description);
      try {
        const { rows: [draft] } = await pool.query<{ id: number }>(
          `INSERT INTO content_drafts (task_id, run_id, platform, title, content)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [task.id, runId, platform, `Черновик из прогона #${runId}`, task.result],
        );
        await pool.query(
          'INSERT INTO content_plan (draft_id, run_id, platform, title) VALUES ($1, $2, $3, $4)',
          [draft.id, runId, platform, `Публикация из прогона #${runId}`],
        );
        draftCount++;
      } catch (err) {
        console.error('Ошибка создания черновика:', (err as Error).message);
      }
    }

    // Уведомление и Word-документ со всеми результатами
    const runGoal = rows[0].goal;
    const notifyText = draftCount > 0
      ? `📦 *Вы одобрили результат!*\n\n🎯 Цель: ${runGoal}\n\n📝 Создано черновиков: ${draftCount} шт.`
      : `📦 *Вы одобрили результат!*\n\n🎯 Цель: ${runGoal}`;
    notifyOwner(notifyText).catch(() => {});

    // Генерируем Word-документ с полными результатами и отправляем в Telegram
    const { rows: allTasks } = await pool.query<Task>(
      'SELECT * FROM tasks WHERE run_id=$1 ORDER BY position ASC',
      [runId],
    );
    const safeName = runGoal.replace(/[^\p{L}\p{N}\s]/gu, '').trim().substring(0, 40) || `прогон_${runId}`;
    const filename = `Рой_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;
    buildRunDocx(rows[0], allTasks)
      .then(buf => sendDocumentToOwner(buf, filename, `📎 Полные результаты прогона #${runId}`))
      .catch(err => console.error('Ошибка генерации docx:', (err as Error).message));
  } catch (e) { next(e); }
});

// POST /api/runs/:id/send-to-telegram — отправить результаты текстовым файлом в Telegram
runsRouter.post('/:id/send-to-telegram', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows: runRows } = await pool.query<Run>('SELECT * FROM runs WHERE id=$1', [runId]);
    if (!runRows.length) { res.status(404).json({ error: 'Прогон не найден' }); return; }

    const run = runRows[0];
    const { rows: tasks } = await pool.query<Task>(
      'SELECT * FROM tasks WHERE run_id=$1 ORDER BY position ASC', [runId],
    );

    const lines: string[] = [
      `Рой ИИ-агентов — Прогон #${runId}`,
      `Цель: ${run.goal}`,
      `Дата: ${new Date(run.created_at).toLocaleDateString('ru-RU')}`,
      `Статус: ${run.status}`,
    ];
    if (run.total_cost_usd > 0) lines.push(`Расходы: $${run.total_cost_usd.toFixed(4)}`);
    lines.push('');

    if (run.summary) {
      lines.push('═══ ИТОГОВАЯ СВОДКА ═══');
      lines.push('');
      lines.push(run.summary);
      lines.push('');
    }

    const tasksWithResult = tasks.filter(t => t.result);
    if (tasksWithResult.length > 0) {
      lines.push('═══ РЕЗУЛЬТАТЫ ЗАДАЧ ═══');
      for (const task of tasksWithResult) {
        lines.push('');
        lines.push(`─── ${task.agent_slug}: ${task.description.substring(0, 80)}${task.description.length > 80 ? '…' : ''} ───`);
        lines.push('');
        lines.push(task.result!);
      }
    }

    const content = lines.join('\n');
    const buffer = Buffer.from(content, 'utf-8');
    const safeName = run.goal.replace(/[^\p{L}\p{N}\s]/gu, '').trim().substring(0, 40) || `прогон_${runId}`;
    const filename = `Рой_${safeName}_${new Date().toISOString().slice(0, 10)}.txt`;

    await sendDocumentToOwner(buffer, filename, `📄 Результаты прогона #${runId}`, 'text/plain');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/runs/:id/request-revision — на доработку (создаёт новый прогон)
runsRouter.post('/:id/request-revision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    const { comment } = req.body as { comment?: string };
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows: runRows } = await pool.query<Run>('SELECT * FROM runs WHERE id=$1', [runId]);
    if (!runRows.length) { res.status(404).json({ error: 'Прогон не найден' }); return; }

    const run = runRows[0];
    const newGoal = comment ? `${run.goal}\n\n[ДОРАБОТКА: ${comment}]` : run.goal;
    const { rows: newRun } = await pool.query<Run>(
      "INSERT INTO runs (goal, status, budget_usd) VALUES ($1, 'planning', $2) RETURNING *",
      [newGoal, run.budget_usd],
    );
    res.json(newRun[0]);

    planRun(newRun[0].id).catch((err: Error) => {
      console.error('Ошибка планирования доработки:', err.message);
      pool.query("UPDATE runs SET status='failed', updated_at=NOW() WHERE id=$1", [newRun[0].id]).catch(() => {});
    });
  } catch (e) { next(e); }
});

// POST /api/runs/:id/rerun — повторить прогон с той же целью
runsRouter.post('/:id/rerun', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    if (isNaN(runId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows: orig } = await pool.query<Run>('SELECT goal, budget_usd FROM runs WHERE id=$1', [runId]);
    if (!orig.length) { res.status(404).json({ error: 'Прогон не найден' }); return; }

    const { rows: newRun } = await pool.query<Run>(
      "INSERT INTO runs (goal, status, budget_usd) VALUES ($1, 'planning', $2) RETURNING *",
      [orig[0].goal, orig[0].budget_usd],
    );
    res.json(newRun[0]);

    planRun(newRun[0].id).catch((err: Error) => {
      console.error('Ошибка повторного планирования:', err.message);
      pool.query("UPDATE runs SET status='failed', updated_at=NOW() WHERE id=$1", [newRun[0].id]).catch(() => {});
    });
  } catch (e) { next(e); }
});

// PUT /api/runs/:id/tasks/:taskId — редактировать задачу плана
runsRouter.put('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    const taskId = parseInt(req.params.taskId);
    if (isNaN(runId) || isNaN(taskId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    // Редактировать можно только пока прогон ждёт одобрения
    const { rows: run } = await pool.query<Run>('SELECT status FROM runs WHERE id=$1', [runId]);
    if (!run.length || run[0].status !== 'awaiting_approval') {
      res.status(400).json({ error: 'Редактировать задачи можно только пока план ждёт одобрения' });
      return;
    }

    const { description, agent_slug } = req.body as { description?: string; agent_slug?: string };
    const fields: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [taskId, runId];
    let i = 3;
    if (description?.trim()) { fields.push(`description = $${i++}`); vals.push(description.trim()); }
    if (agent_slug?.trim())  { fields.push(`agent_slug  = $${i++}`); vals.push(agent_slug.trim()); }

    const { rows } = await pool.query<Task>(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id=$1 AND run_id=$2 RETURNING *`,
      vals,
    );
    res.json(rows[0] ?? null);
  } catch (e) { next(e); }
});

// DELETE /api/runs/:id/tasks/:taskId — удалить задачу из плана
runsRouter.delete('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = parseInt(req.params.id);
    const taskId = parseInt(req.params.taskId);
    if (isNaN(runId) || isNaN(taskId)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { rows: run } = await pool.query<Run>('SELECT status FROM runs WHERE id=$1', [runId]);
    if (!run.length || run[0].status !== 'awaiting_approval') {
      res.status(400).json({ error: 'Удалять задачи можно только пока план ждёт одобрения' });
      return;
    }

    await pool.query('DELETE FROM tasks WHERE id=$1 AND run_id=$2', [taskId, runId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/runs/solo — прямая задача агенту (без планирования)
runsRouter.post('/solo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent_slug, description, budget_usd } = req.body as {
      agent_slug?: string;
      description?: string;
      budget_usd?: number;
    };
    if (!agent_slug?.trim()) { res.status(400).json({ error: 'Поле agent_slug обязательно' }); return; }
    if (!description?.trim()) { res.status(400).json({ error: 'Поле description обязательно' }); return; }

    const runId = await launchSoloTask({
      agentSlug: agent_slug.trim(),
      description: description.trim(),
      projectId: req.projectId,
      budgetUsd: budget_usd || undefined,
    });

    const { rows } = await pool.query<Run>('SELECT * FROM runs WHERE id=$1', [runId]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});
