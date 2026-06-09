// Telegram-бот с long-polling. Двустороннее управление через чат.
import { env } from './env';
import { pool } from './db';
import { chat as chatWithAgent } from './agents/conversational';
import { launchSoloTask } from './agents/orchestrator';
import type { Agent } from '@swarm/shared';

const API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

// Состояние сессии (текущий проект, режим ожидания)
interface Session {
  projectSlug: string;
  projectId: number | null;
  waitingFor: null | 'agent_message' | 'idea_text' | 'task_desc';
  pendingAgent: string | null;
}

const sessions = new Map<number, Session>();

function getSession(chatId: number): Session {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      projectSlug: 'demo',
      projectId: null,
      waitingFor: null,
      pendingAgent: null,
    });
  }
  return sessions.get(chatId)!;
}

// ── Telegram API ────────────────────────────────────────────────────────────

async function tgFetch(method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; result?: unknown };
  return data.result;
}

async function send(chatId: number, text: string, opts: Record<string, unknown> = {}): Promise<void> {
  if (!text.trim()) return;
  // Telegram лимит — 4096 символов на сообщение
  const chunks = text.match(/[\s\S]{1,4000}/g) ?? [text];
  for (const chunk of chunks) {
    await tgFetch('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'Markdown', ...opts });
  }
}

async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await tgFetch('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text ?? '' });
}

async function editMessage(chatId: number, messageId: number, text: string): Promise<void> {
  await tgFetch('editMessageText', {
    chat_id: chatId, message_id: messageId,
    text, parse_mode: 'Markdown',
  });
}

// ── Обработчики команд ──────────────────────────────────────────────────────

async function cmdHelp(chatId: number) {
  const text = `*🤖 Рой ИИ-агентов*\n\n` +
    `*Управление*\n` +
    `/project — список проектов\n` +
    `/project <slug> — переключить проект\n` +
    `/runs — последние прогоны\n\n` +
    `*Идеи*\n` +
    `/idea <текст> — добавить идею в инбокс\n` +
    `/inbox — показать инбокс с кнопками\n\n` +
    `*Задачи*\n` +
    `/task <агент> <описание> — прямая задача агенту\n\n` +
    `*Чат*\n` +
    `/agent <slug> — начать чат с агентом\n` +
    `После /agent просто пишите сообщения\n\n` +
    `*Агенты:* strategist, scriptwriter, reelsmaker, designer, publisher, programmer, critic\n\n` +
    `*Текущий проект:* ${(getSession(chatId)).projectSlug}`;
  await send(chatId, text);
}

async function cmdInbox(chatId: number) {
  const session = getSession(chatId);
  await resolveProject(session);

  const { rows } = await pool.query<{ id: number; text: string; source: string; created_at: string }>(
    `SELECT id, text, source, created_at FROM idea_inbox
     WHERE ($1::int IS NULL OR project_id = $1) AND status IN ('new', 'in_progress')
     ORDER BY created_at DESC LIMIT 10`,
    [session.projectId],
  );

  if (!rows.length) {
    await send(chatId, '💡 Инбокс пуст. Добавьте идею командой /idea <текст>');
    return;
  }

  await send(chatId, `*💡 Инбокс идей (${session.projectSlug}):*\nНажмите кнопку под идеей, чтобы запустить или отклонить.\n`);

  for (const idea of rows) {
    const preview = idea.text.length > 200 ? idea.text.substring(0, 200) + '…' : idea.text;
    const date = new Date(idea.created_at).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const src = idea.source !== 'manual' ? ` · ${idea.source}` : '';

    await tgFetch('sendMessage', {
      chat_id: chatId,
      text: `_${date}${src}_\n\n${preview}`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 В прогон', callback_data: `idea_launch_${idea.id}` },
          { text: '❌ Отклонить', callback_data: `idea_reject_${idea.id}` },
        ]],
      },
    });
  }
}

async function cmdProject(chatId: number, arg: string) {
  const session = getSession(chatId);

  if (!arg) {
    const { rows } = await pool.query('SELECT slug, name FROM projects ORDER BY name');
    const list = rows.map((p: { slug: string; name: string }) =>
      `• \`${p.slug}\` — ${p.name}${p.slug === session.projectSlug ? ' ✅' : ''}`
    ).join('\n');
    await send(chatId, `*Проекты:*\n\n${list}\n\nПереключить: /project <slug>`);
    return;
  }

  const { rows } = await pool.query('SELECT id, name FROM projects WHERE slug=$1', [arg]);
  if (!rows.length) {
    await send(chatId, `❌ Проект \`${arg}\` не найден. Список: /project`);
    return;
  }
  session.projectSlug = arg;
  session.projectId = rows[0].id;
  await send(chatId, `✅ Переключились на проект *${rows[0].name}*`);
}

async function cmdRuns(chatId: number) {
  const session = getSession(chatId);
  await resolveProject(session);

  const { rows } = await pool.query(
    `SELECT id, goal, status, created_at FROM runs
     WHERE ($1::int IS NULL OR project_id = $1)
     ORDER BY created_at DESC LIMIT 5`,
    [session.projectId],
  );

  if (!rows.length) {
    await send(chatId, 'Прогонов пока нет. Создайте через /task или дашборд.');
    return;
  }

  const STATUS_EMOJI: Record<string, string> = {
    planning: '⏳', awaiting_approval: '📋', running: '⚡',
    awaiting_review: '✅', completed: '🎉', failed: '❌',
  };

  const lines = rows.map((r: { id: number; goal: string; status: string; created_at: string }) => {
    const emoji = STATUS_EMOJI[r.status] ?? '•';
    const date = new Date(r.created_at).toLocaleDateString('ru-RU');
    const goal = r.goal.substring(0, 60) + (r.goal.length > 60 ? '…' : '');
    return `${emoji} #${r.id} — ${goal}\n   _${date}_`;
  }).join('\n\n');

  await send(chatId, `*Последние прогоны (${session.projectSlug}):*\n\n${lines}`);
}

async function cmdTask(chatId: number, rest: string) {
  const session = getSession(chatId);
  await resolveProject(session);

  const parts = rest.trim().split(/\s+/);
  const agentSlug = parts[0]?.toLowerCase();
  const description = parts.slice(1).join(' ');

  const validAgents = ['strategist', 'scriptwriter', 'reelsmaker', 'montager', 'designer', 'publisher', 'programmer', 'critic'];

  if (!agentSlug || !validAgents.includes(agentSlug)) {
    await send(chatId,
      `❌ Укажите агента. Пример:\n/task scriptwriter Напиши пост о нашем продукте\n\n` +
      `Агенты: ${validAgents.join(', ')}`
    );
    return;
  }

  if (!description) {
    await send(chatId, `❌ Укажите описание задачи.\n/task ${agentSlug} <описание>`);
    return;
  }

  await send(chatId, `⚡ Запускаю задачу для *${agentSlug}*…`);

  try {
    const runId = await launchSoloTask({
      agentSlug,
      description,
      projectId: session.projectId,
    });
    await send(chatId, `✅ Задача запущена! Прогон #${runId}\nПроверьте результат в дашборде.`);
  } catch (err) {
    await send(chatId, `❌ Ошибка: ${(err as Error).message}`);
  }
}

async function cmdIdea(chatId: number, text: string) {
  const session = getSession(chatId);
  await resolveProject(session);

  if (!text.trim()) {
    session.waitingFor = 'idea_text';
    await send(chatId, '💡 Напишите вашу идею:');
    return;
  }

  await addIdea(chatId, session, text.trim());
}

async function addIdea(chatId: number, session: Session, text: string) {
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO idea_inbox (project_id, text, source, status)
       VALUES ($1, $2, 'telegram', 'new') RETURNING id`,
      [session.projectId, text],
    );
    const ideaId = rows[0].id;
    const preview = text.length > 120 ? text.substring(0, 120) + '…' : text;

    await tgFetch('sendMessage', {
      chat_id: chatId,
      text: `💡 *Идея добавлена!*\n\n_${preview}_`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 Сразу в прогон', callback_data: `idea_launch_${ideaId}` },
          { text: '❌ Отклонить', callback_data: `idea_reject_${ideaId}` },
        ]],
      },
    });
  } catch (err) {
    await send(chatId, `❌ Ошибка: ${(err as Error).message}`);
  }
}

async function cmdAgent(chatId: number, agentSlug: string) {
  const session = getSession(chatId);

  const validAgents = ['strategist', 'scriptwriter', 'reelsmaker', 'montager', 'designer', 'publisher', 'programmer', 'critic'];
  if (!agentSlug || !validAgents.includes(agentSlug.toLowerCase())) {
    await send(chatId,
      `❌ Укажите агента. Например: /agent strategist\n\nАгенты: ${validAgents.join(', ')}`
    );
    return;
  }

  session.waitingFor = 'agent_message';
  session.pendingAgent = agentSlug.toLowerCase();
  await send(chatId, `🤖 Чат с *${agentSlug}* активен.\nПишите сообщения — я передам их агенту.\n\nОтменить: /cancel`);
}

async function handleAgentMessage(chatId: number, session: Session, text: string) {
  const agentSlug = session.pendingAgent!;
  await send(chatId, '⏳ Агент думает…');

  try {
    await resolveProject(session);

    // Получаем данные агента из БД
    const { rows } = await pool.query<Agent>(
      'SELECT * FROM agents WHERE slug=$1 AND is_active=TRUE',
      [agentSlug],
    );
    if (!rows.length) {
      await send(chatId, `❌ Агент ${agentSlug} не найден.`);
      return;
    }

    const result = await chat(rows[0], text, session.projectId ?? undefined);
    await send(chatId, result.reply);
  } catch (err) {
    await send(chatId, `❌ Ошибка: ${(err as Error).message}`);
  }
}

// ── Обработчик inline-кнопок ────────────────────────────────────────────────

async function handleCallbackQuery(callbackQuery: {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}): Promise<void> {
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data ?? '';

  if (!chatId) return;

  const ownerId = parseInt(env.TELEGRAM_OWNER_CHAT_ID);
  if (ownerId && callbackQuery.from.id !== ownerId) {
    await answerCallback(callbackQuery.id, '❌ Нет доступа');
    return;
  }

  // idea_launch_<id>
  if (data.startsWith('idea_launch_')) {
    const ideaId = parseInt(data.replace('idea_launch_', ''));
    if (isNaN(ideaId)) { await answerCallback(callbackQuery.id, '❌ Неверный ID'); return; }

    const { rows: items } = await pool.query<{ id: number; text: string; project_id: number | null }>(
      'SELECT id, text, project_id FROM idea_inbox WHERE id=$1',
      [ideaId],
    );
    if (!items.length) { await answerCallback(callbackQuery.id, '❌ Идея не найдена'); return; }

    const idea = items[0];

    try {
      // Создаём прогон и запускаем планирование (как в /api/inbox/:id/launch)
      const { planRun } = await import('./agents/orchestrator');
      const { rows: runRows } = await pool.query<{ id: number }>(
        "INSERT INTO runs (goal, status, project_id) VALUES ($1, 'planning', $2) RETURNING id",
        [idea.text, idea.project_id],
      );
      const runId = runRows[0].id;
      await pool.query("UPDATE idea_inbox SET status='in_progress', run_id=$1 WHERE id=$2", [runId, ideaId]);

      planRun(runId).catch((err: Error) => {
        console.error('Ошибка планирования идеи из Telegram:', err.message);
        pool.query("UPDATE runs SET status='failed' WHERE id=$1", [runId]).catch(() => {});
      });

      await answerCallback(callbackQuery.id, '🚀 Запущено!');
      if (messageId) {
        const preview = idea.text.length > 120 ? idea.text.substring(0, 120) + '…' : idea.text;
        await editMessage(chatId, messageId, `✅ *Запущено в прогон #${runId}*\n\n_${preview}_`);
      }
    } catch (err) {
      await answerCallback(callbackQuery.id, '❌ Ошибка запуска');
      console.error('idea_launch error:', (err as Error).message);
    }
    return;
  }

  // idea_reject_<id>
  if (data.startsWith('idea_reject_')) {
    const ideaId = parseInt(data.replace('idea_reject_', ''));
    if (isNaN(ideaId)) { await answerCallback(callbackQuery.id, '❌ Неверный ID'); return; }

    const { rows } = await pool.query<{ text: string }>(
      'SELECT text FROM idea_inbox WHERE id=$1',
      [ideaId],
    );
    if (!rows.length) { await answerCallback(callbackQuery.id, '❌ Идея не найдена'); return; }

    await pool.query("UPDATE idea_inbox SET status='rejected' WHERE id=$1", [ideaId]);
    await answerCallback(callbackQuery.id, '🗑 Отклонено');

    if (messageId) {
      const preview = rows[0].text.length > 120 ? rows[0].text.substring(0, 120) + '…' : rows[0].text;
      await editMessage(chatId, messageId, `~~❌ Отклонено~~\n\n_${preview}_`);
    }
    return;
  }

  await answerCallback(callbackQuery.id);
}

// ── Вспомогательные ─────────────────────────────────────────────────────────

async function resolveProject(session: Session): Promise<void> {
  if (session.projectId) return;
  const { rows } = await pool.query('SELECT id FROM projects WHERE slug=$1', [session.projectSlug]);
  session.projectId = rows[0]?.id ?? null;
}

// Обёртка для chat — используем conversational напрямую
const chat = chatWithAgent;

// ── Обработчик сообщений ────────────────────────────────────────────────────

async function processUpdate(update: {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    from?: { id: number; first_name?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}): Promise<void> {
  // Обработка нажатий inline-кнопок
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const ownerId = parseInt(env.TELEGRAM_OWNER_CHAT_ID);

  // Только от владельца
  if (ownerId && chatId !== ownerId) {
    await send(chatId, '❌ Этот бот только для владельца проекта.');
    return;
  }

  const session = getSession(chatId);

  // Команды с /
  if (text.startsWith('/')) {
    const [cmd, ...argParts] = text.slice(1).split(' ');
    const arg = argParts.join(' ');
    const command = cmd.toLowerCase().replace(/@.*$/, ''); // убираем @botname

    // Сброс режима ожидания при любой команде
    if (command !== 'cancel') {
      session.waitingFor = null;
      session.pendingAgent = null;
    }

    switch (command) {
      case 'start':
      case 'help':     return cmdHelp(chatId);
      case 'project':  return cmdProject(chatId, arg);
      case 'runs':     return cmdRuns(chatId);
      case 'task':     return cmdTask(chatId, arg);
      case 'idea':     return cmdIdea(chatId, arg);
      case 'inbox':    return cmdInbox(chatId);
      case 'agent':    return cmdAgent(chatId, arg);
      case 'cancel':
        session.waitingFor = null;
        session.pendingAgent = null;
        await send(chatId, '✅ Режим отменён.');
        return;
      default:
        await send(chatId, `❓ Команда /${command} не найдена. Справка: /help`);
    }
    return;
  }

  // Режим ожидания: идея
  if (session.waitingFor === 'idea_text') {
    session.waitingFor = null;
    await resolveProject(session);
    await addIdea(chatId, session, text);
    return;
  }

  // Режим ожидания: чат с агентом
  if (session.waitingFor === 'agent_message' && session.pendingAgent) {
    await handleAgentMessage(chatId, session, text);
    return;
  }

  // Свободный текст — подсказка
  await send(chatId, `Не понял. Список команд: /help\n\nЧтобы добавить идею: /idea <текст>\nЧтобы поставить задачу: /task <агент> <задача>`);
}

// ── Запуск long-polling ─────────────────────────────────────────────────────

export function startTelegramBot(): void {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('ℹ️  TELEGRAM_BOT_TOKEN не задан — бот не запущен');
    return;
  }

  let offset = 0;
  let running = true;

  async function poll(): Promise<void> {
    while (running) {
      try {
        const result = await fetch(
          `${API}/getUpdates?offset=${offset}&timeout=25&allowed_updates=["message","callback_query"]`,
          { signal: AbortSignal.timeout(35_000) },
        );
        const data = await result.json() as { ok: boolean; result: Array<{ update_id: number }> };

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            processUpdate(update as Parameters<typeof processUpdate>[0]).catch((err: Error) => {
              console.error('Telegram processUpdate error:', err.message);
            });
          }
        }
      } catch (err) {
        const msg = (err as Error).message;
        if (!msg.includes('abort') && !msg.includes('timeout')) {
          console.error('Telegram poll error:', msg);
          await new Promise(r => setTimeout(r, 5_000));
        }
      }
    }
  }

  console.log('🤖 Telegram-бот запущен (long-polling)');
  poll().catch(console.error);
}
