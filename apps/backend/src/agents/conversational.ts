import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import { pool } from '../db';
import { getProfile, buildProfileContext } from '../profile';
import { searchKnowledge, getPinnedContext } from '../knowledge';
import { FETCH_URL_TOOL, fetchUrlContent } from './web';
import type { Agent, ChatMessage, AttachedFile } from '@swarm/shared';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// Формирует содержимое пользовательского сообщения: текст и/или файл
function buildUserContent(
  text: string,
  file?: AttachedFile,
): Anthropic.MessageParam['content'] {
  if (!file) return text;

  const textBlock: Anthropic.TextBlockParam = { type: 'text', text };

  if (file.mimeType.startsWith('image/')) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    const mediaType = allowed.find((t) => t === file.mimeType) ?? 'image/jpeg';
    return [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: file.data } },
      textBlock,
    ];
  }

  if (file.mimeType === 'application/pdf') {
    const docBlock: Anthropic.DocumentBlockParam = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file.data },
      title: file.name,
    };
    return [docBlock, textBlock];
  }

  if (file.mimeType === 'text/plain') {
    const plainText = Buffer.from(file.data, 'base64').toString('utf-8');
    const docBlock: Anthropic.DocumentBlockParam = {
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: plainText } as Anthropic.PlainTextSource,
      title: file.name,
    };
    return [docBlock, textBlock];
  }

  // DOCX и другие форматы — передаём как документ
  const docBlock = {
    type: 'document' as const,
    source: { type: 'base64' as const, media_type: file.mimeType, data: file.data },
    title: file.name,
  } as unknown as Anthropic.DocumentBlockParam;
  return [docBlock, textBlock];
}

export async function chat(
  agent: Agent,
  userMessage: string,
  projectId?: number,
  file?: AttachedFile,
): Promise<{ reply: string; history: ChatMessage[] }> {
  // История диалога только для этого проекта
  const { rows: history } = await pool.query<ChatMessage>(
    `SELECT * FROM chat_messages
     WHERE agent_id = $1
       AND (project_id = $2 OR ($2::int IS NULL AND project_id IS NULL))
     ORDER BY created_at ASC`,
    [agent.id, projectId ?? null],
  );

  const effectiveText = userMessage.trim() || 'Проанализируй прикреплённый файл.';
  const dbContent = file
    ? (userMessage.trim() ? `${userMessage.trim()}\n📎 ${file.name}` : `📎 ${file.name}`)
    : userMessage;

  await pool.query(
    'INSERT INTO chat_messages (agent_id, project_id, role, content) VALUES ($1, $2, $3, $4)',
    [agent.id, projectId ?? null, 'user', dbContent],
  );

  // Профиль проекта + постоянный контекст + поиск по знаниям
  const profile = await getProfile(projectId);
  const profileCtx = buildProfileContext(profile);

  // Постоянный контекст всегда подставляется в промпт
  const pinnedCtx = projectId ? await getPinnedContext(projectId) : '';

  let knowledgeCtx = '';
  if (projectId) {
    const chunks = await searchKnowledge(projectId, userMessage, 3);
    if (chunks.length > 0) {
      knowledgeCtx = '\n\n---\n# БАЗА ЗНАНИЙ ПРОЕКТА\n'
        + chunks.map((c) => c.content).join('\n\n---\n')
        + '\n---';
    }
  }

  const systemPrompt = agent.system_prompt + profileCtx + pinnedCtx + knowledgeCtx;

  const MAX_WEB_ROUNDS = 5;

  const userContent = buildUserContent(effectiveText, file);
  let apiMessages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userContent },
  ];

  let response = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: apiMessages,
    tools: [FETCH_URL_TOOL],
  });

  // Цикл обработки tool_use: агент может читать страницы до MAX_WEB_ROUNDS раз
  for (let round = 0; round < MAX_WEB_ROUNDS && response.stop_reason === 'tool_use'; round++) {
    const toolCalls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolCalls.map(async (block) => {
        const { url } = block.input as { url: string };
        const content = await fetchUrlContent(url);
        return { type: 'tool_result' as const, tool_use_id: block.id, content };
      }),
    );

    apiMessages = [
      ...apiMessages,
      { role: 'assistant' as const, content: response.content },
      { role: 'user' as const, content: toolResults },
    ];

    response = await getClient().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
      tools: [FETCH_URL_TOOL],
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const reply = textBlock?.text ?? '(пустой ответ)';

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
