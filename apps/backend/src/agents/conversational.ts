import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import { pool } from '../db';
import { getProfile, buildProfileContext } from '../profile';
import { searchKnowledge } from '../knowledge';
import type { Agent, ChatMessage } from '@swarm/shared';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function chat(
  agent: Agent,
  userMessage: string,
  projectId?: number,
): Promise<{ reply: string; history: ChatMessage[] }> {
  // История диалога только для этого проекта
  const { rows: history } = await pool.query<ChatMessage>(
    `SELECT * FROM chat_messages
     WHERE agent_id = $1
       AND (project_id = $2 OR ($2::int IS NULL AND project_id IS NULL))
     ORDER BY created_at ASC`,
    [agent.id, projectId ?? null],
  );

  await pool.query(
    'INSERT INTO chat_messages (agent_id, project_id, role, content) VALUES ($1, $2, $3, $4)',
    [agent.id, projectId ?? null, 'user', userMessage],
  );

  // Профиль проекта + знания
  const profile = await getProfile(projectId);
  const profileCtx = buildProfileContext(profile);

  let knowledgeCtx = '';
  if (projectId) {
    const chunks = await searchKnowledge(projectId, userMessage, 3);
    if (chunks.length > 0) {
      knowledgeCtx = '\n\n---\n# БАЗА ЗНАНИЙ ПРОЕКТА\n'
        + chunks.map((c) => c.content).join('\n\n---\n')
        + '\n---';
    }
  }

  const systemPrompt = agent.system_prompt + profileCtx + knowledgeCtx;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const response = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const reply = (response.content[0] as Anthropic.TextBlock).text;

  await pool.query(
    'INSERT INTO chat_messages (agent_id, project_id, role, content) VALUES ($1, $2, $3, $4)',
    [agent.id, projectId ?? null, 'assistant', reply],
  );

  const { rows: updatedHistory } = await pool.query<ChatMessage>(
    `SELECT * FROM chat_messages
     WHERE agent_id = $1
       AND (project_id = $2 OR ($2::int IS NULL AND project_id IS NULL))
     ORDER BY created_at ASC`,
    [agent.id, projectId ?? null],
  );

  return { reply, history: updatedHistory };
}
