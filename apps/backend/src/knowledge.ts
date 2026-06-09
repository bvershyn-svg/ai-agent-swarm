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
