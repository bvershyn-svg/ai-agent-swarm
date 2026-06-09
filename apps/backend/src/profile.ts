// Профиль проекта (per-project)
import { pool } from './db';
import type { ProjectProfile } from '@swarm/shared';

export async function getProfile(projectId?: number | null): Promise<ProjectProfile | null> {
  const id = projectId ?? null;
  if (id === null) return null;
  const { rows } = await pool.query<ProjectProfile>(
    'SELECT * FROM project_profile WHERE project_id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function updateProfile(
  projectId: number,
  data: Partial<Omit<ProjectProfile, 'id' | 'project_id' | 'updated_at'>>,
): Promise<ProjectProfile> {
  await pool.query(
    'INSERT INTO project_profile (project_id) VALUES ($1) ON CONFLICT (project_id) DO NOTHING',
    [projectId],
  );

  const fields: string[] = ['updated_at = NOW()'];
  const vals: unknown[]  = [projectId];
  let i = 2;
  for (const key of ['business', 'audience', 'products', 'tone', 'taboo', 'examples'] as const) {
    if (data[key] != null) {
      fields.push(`${key} = $${i++}`);
      vals.push(data[key]);
    }
  }

  const { rows } = await pool.query<ProjectProfile>(
    `UPDATE project_profile SET ${fields.join(', ')} WHERE project_id = $1 RETURNING *`,
    vals,
  );
  return rows[0];
}

export function buildProfileContext(profile: ProjectProfile | null): string {
  if (!profile) return '';
  const parts: string[] = [];
  if (profile.business)  parts.push(`Бизнес: ${profile.business}`);
  if (profile.audience)  parts.push(`Целевая аудитория: ${profile.audience}`);
  if (profile.products)  parts.push(`Продукты / услуги: ${profile.products}`);
  if (profile.tone)      parts.push(`Тон и стиль: ${profile.tone}`);
  if (profile.taboo)     parts.push(`Запрещено: ${profile.taboo}`);
  if (profile.examples)  parts.push(`Примеры хорошего контента:\n${profile.examples}`);
  if (!parts.length) return '';
  return `\n\n---\n# КОНТЕКСТ ПРОЕКТА\n${parts.join('\n')}\n---`;
}
