// Журнал активности и лента уведомлений
import { pool } from './db';
import type { ActivityLog, SwarmEvent } from '@swarm/shared';

// Записать событие в журнал активности
export async function log(
  runId: number,
  taskId: number | null,
  agentSlug: string | null,
  action: string,
  details?: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log (run_id, task_id, agent_slug, action, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [runId, taskId, agentSlug, action, details ?? null],
    );
  } catch (err) {
    // Ошибки журнала не должны ронять прогон
    console.error('Ошибка журнала:', (err as Error).message);
  }
}

// Создать уведомление для владельца
export async function createEvent(
  runId: number | null,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO events (run_id, type, payload) VALUES ($1, $2, $3)`,
      [runId, type, JSON.stringify(payload)],
    );
  } catch (err) {
    console.error('Ошибка создания события:', (err as Error).message);
  }
}

// Получить журнал активности прогона
export async function getActivityLog(runId: number): Promise<ActivityLog[]> {
  const { rows } = await pool.query<ActivityLog>(
    `SELECT * FROM activity_log WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId],
  );
  return rows;
}

// Получить непрочитанные уведомления
export async function getUnreadEvents(): Promise<SwarmEvent[]> {
  const { rows } = await pool.query<SwarmEvent>(
    `SELECT * FROM events WHERE read_at IS NULL ORDER BY created_at DESC`,
  );
  return rows;
}

// Количество непрочитанных уведомлений
export async function getUnreadCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events WHERE read_at IS NULL`,
  );
  return parseInt(rows[0].count, 10);
}
