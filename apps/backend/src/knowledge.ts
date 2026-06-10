// Поиск по базе знаний проекта (полнотекстовый через tsvector)
import { pool } from './db';

export interface KnowledgeChunkRow {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
}

export async function searchKnowledge(
  projectId: number,
  query: string,
  limit = 3,
): Promise<KnowledgeChunkRow[]> {
  if (!query.trim()) return [];
  try {
    const { rows } = await pool.query<KnowledgeChunkRow>(
      `SELECT id, content, metadata
       FROM knowledge_chunks
       WHERE project_id = $1
         AND tsv @@ plainto_tsquery('russian', $2)
       ORDER BY ts_rank(tsv, plainto_tsquery('russian', $2)) DESC
       LIMIT $3`,
      [projectId, query, limit],
    );
    return rows;
  } catch {
    return [];
  }
}

export async function addKnowledgeChunk(
  sourceId: number,
  projectId: number,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    'INSERT INTO knowledge_chunks (source_id, project_id, content, metadata) VALUES ($1, $2, $3, $4)',
    [sourceId, projectId, content, JSON.stringify(metadata)],
  );
}

// Разбивает текст на перекрывающиеся фрагменты по абзацам и предложениям
export function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const near = text.slice(end - 50, end + 50);
      const para = near.lastIndexOf('\n\n');
      if (para >= 0) { end = end - 50 + para + 2; }
      else { const sent = near.lastIndexOf('. '); if (sent >= 0) end = end - 50 + sent + 2; }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

// Возвращает постоянный контекст проекта (закреплённые материалы) для подстановки в системный промпт
export async function getPinnedContext(projectId: number): Promise<string> {
  try {
    const { rows } = await pool.query<{ name: string; content: string }>(
      `SELECT ks.name,
              substring(string_agg(kc.content, E'\n\n' ORDER BY kc.id), 1, 4000) AS content
       FROM knowledge_sources ks
       JOIN knowledge_chunks kc ON kc.source_id = ks.id
       WHERE ks.project_id = $1 AND ks.is_pinned = TRUE
       GROUP BY ks.id, ks.name
       ORDER BY ks.created_at ASC
       LIMIT 5`,
      [projectId],
    );
    if (!rows.length) return '';
    const items = rows.map((r) => `## ${r.name}\n${r.content}`).join('\n\n');
    return `\n\n---\n# ПОСТОЯННЫЙ КОНТЕКСТ ПРОЕКТА\n${items}\n---`;
  } catch {
    return '';
  }
}
