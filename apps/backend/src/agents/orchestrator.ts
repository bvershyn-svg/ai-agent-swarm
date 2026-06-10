// Оркестратор роя: план → выполнение → критика → сводка
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db';
import { env } from '../env';
import { log, createEvent } from '../journal';
import { notifyOwner, notifyOwnerWithButtons } from '../notify';
import { getProfile, buildProfileContext } from '../profile';
import { getPinnedContext } from '../knowledge';
import { PLAN_TOOL, REVIEW_TOOL } from './tools';
import { FETCH_URL_TOOL, fetchUrlContent } from './web';
import { queue } from './queue';
import type { Run, Task } from '@swarm/shared';

const anthropic = new Anthropic();

const SMALL_RUN_THRESHOLD = 3;
const MAX_REVISIONS = 2;
const AGENT_TIMEOUT_MS = 90_000; // 90 секунд на одного агента

// Стоимость за 1M токенов (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8':   { input: 5,   output: 25  },
  'claude-opus-4-7':   { input: 5,   output: 25  },
  'claude-opus-4-6':   { input: 5,   output: 25  },
  'claude-sonnet-4-6': { input: 3,   output: 15  },
  'claude-haiku-4-5':  { input: 1,   output: 5   },
};

const AGENT_NAMES: Record<string, string> = {
  strategist:   'Стратег',
  scriptwriter: 'Сценарист',
  reelsmaker:   'Рилсмейкер',
  montager:     'Монтажёр',
  designer:     'Дизайнер',
  publisher:    'Публикатор',
  programmer:   'Программист',
  critic:       'Критик',
};

// ── Утилиты ──────────────────────────────────────────────────────────────

function calcCostUsd(inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[env.ANTHROPIC_MODEL] ?? { input: 3, output: 15 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Таймаут: ${label} не ответил за 90 секунд`)),
      AGENT_TIMEOUT_MS,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function isRetryable(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '');
  return msg.includes('overloaded') || msg.includes('529') || msg.includes('503') || msg.includes('timeout');
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isRetryable(err)) {
      await new Promise((r) => setTimeout(r, 3000));
      return callWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

// ── Вспомогательные функции БД ────────────────────────────────────────────

async function getRun(runId: number): Promise<Run> {
  const { rows } = await pool.query<Run>('SELECT * FROM runs WHERE id = $1', [runId]);
  if (!rows.length) throw new Error(`Прогон ${runId} не найден`);
  return rows[0];
}

async function updateTask(
  taskId: number,
  updates: Partial<{
    status: string;
    result: string;
    critic_verdict: string;
    revision_round: number;
    description: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>,
): Promise<void> {
  const map: Record<string, string> = {
    status: 'status', result: 'result', critic_verdict: 'critic_verdict',
    revision_round: 'revision_round', description: 'description',
    input_tokens: 'input_tokens', output_tokens: 'output_tokens', cost_usd: 'cost_usd',
  };
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [taskId];
  let i = 2;
  for (const [k, col] of Object.entries(map)) {
    const v = updates[k as keyof typeof updates];
    if (v !== undefined) { sets.push(`${col} = $${i++}`); vals.push(v); }
  }
  await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, vals);
}

async function addRunCost(runId: number, tokens: number, costUsd: number): Promise<void> {
  await pool.query(
    'UPDATE runs SET total_tokens=total_tokens+$1, total_cost_usd=total_cost_usd+$2, updated_at=NOW() WHERE id=$3',
    [tokens, costUsd, runId],
  );
}

async function checkBudget(runId: number): Promise<{ ok: boolean; msg?: string }> {
  const { rows } = await pool.query<{ budget_usd: number | null; total_cost_usd: number }>(
    'SELECT budget_usd, total_cost_usd FROM runs WHERE id=$1',
    [runId],
  );
  const r = rows[0];
  if (!r?.budget_usd) return { ok: true };
  if (r.total_cost_usd >= r.budget_usd) {
    return {
      ok: false,
      msg: `Бюджет исчерпан: потрачено $${r.total_cost_usd.toFixed(4)} из $${r.budget_usd.toFixed(2)}`,
    };
  }
  return { ok: true };
}

// ── Системные промпты ─────────────────────────────────────────────────────

const PLAN_SYSTEM = `Ты — Стратег, оркестратор роя ИИ-агентов для автоматического ведения соцсетей.
Твоя задача: разбить цель владельца на конкретные, самодостаточные задачи для агентов-исполнителей.
Каждая задача должна быть достаточно детальна, чтобы агент выполнил её без дополнительных вопросов.
Используй только тех агентов, которые реально нужны для этой цели.
Порядок задач важен — если задача B использует результат A, укажи это в depends_on.
Вызови инструмент create_plan с готовым планом.`;

const SUMMARY_SYSTEM = `Ты — Стратег. Рой завершил работу. Напиши итоговую сводку для владельца.
Структурируй: что сделано, ключевые результаты, что готово на выходе.
Пиши по-русски, ясно и конкретно. Не более 400 слов.`;

// ── Планирование ──────────────────────────────────────────────────────────

export async function planRun(runId: number): Promise<void> {
  const run = await getRun(runId);
  const profile = await getProfile(run.project_id);
  const profileCtx = buildProfileContext(profile);
  // Постоянный контекст проекта для Стратега
  const pinnedCtx = run.project_id ? await getPinnedContext(run.project_id) : '';

  const { rows: agents } = await pool.query<{ slug: string; name: string; description: string }>(
    `SELECT slug, name, description FROM agents
     WHERE is_active = TRUE AND slug NOT IN ('strategist', 'critic') ORDER BY name`,
  );
  const agentList = agents.map((a) => `- ${a.slug}: ${a.name} — ${a.description}`).join('\n');

  await log(runId, null, 'strategist', 'planning_started', 'Стратег составляет план');

  let response: Anthropic.Message;
  try {
    response = await callWithRetry(() =>
      withTimeout(
        anthropic.messages.create({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 2048,
          system: PLAN_SYSTEM + profileCtx + pinnedCtx,
          messages: [{ role: 'user', content: `Цель: "${run.goal}"\n\nДоступные агенты:\n${agentList}` }],
          tools: [PLAN_TOOL],
          tool_choice: { type: 'tool', name: 'create_plan' },
        }),
        'Стратег (планирование)',
      )
    );
  } catch (err) {
    await pool.query("UPDATE runs SET status='failed', updated_at=NOW() WHERE id=$1", [runId]);
    throw err;
  }

  // Учёт стоимости планирования
  const planCost = calcCostUsd(response.usage.input_tokens, response.usage.output_tokens);
  await addRunCost(runId, response.usage.input_tokens + response.usage.output_tokens, planCost);

  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) throw new Error('Стратег не вернул план задач');

  const plan = toolBlock.input as {
    tasks: Array<{ agent_slug: string; description: string; depends_on?: number[] }>;
    needs_approval: boolean;
    rationale: string;
  };

  // Вставляем задачи (0-based индексы → реальные DB ID)
  const taskIds: number[] = [];
  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i];
    const deps = (t.depends_on ?? [])
      .map((idx) => taskIds[idx])
      .filter((id): id is number => id !== undefined);
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO tasks (run_id, agent_slug, description, depends_on, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [runId, t.agent_slug, t.description, deps, i],
    );
    taskIds.push(rows[0].id);
  }

  const needsApproval = plan.needs_approval || plan.tasks.length > SMALL_RUN_THRESHOLD;

  await pool.query(
    'UPDATE runs SET status=$1, plan_json=$2, updated_at=NOW() WHERE id=$3',
    [needsApproval ? 'awaiting_approval' : 'running', JSON.stringify(plan.tasks), runId],
  );

  await log(runId, null, 'strategist', 'plan_created',
    `Создан план из ${plan.tasks.length} задач. ${plan.rationale}`);
  await createEvent(runId, 'plan_ready', {
    run_id: runId, task_count: plan.tasks.length, needs_approval: needsApproval, rationale: plan.rationale,
  });

  if (needsApproval) {
    const taskList = plan.tasks.map((t, i) =>
      `${i + 1}. [${AGENT_NAMES[t.agent_slug] ?? t.agent_slug}] ${t.description.substring(0, 80)}`
    ).join('\n');
    await notifyOwnerWithButtons(
      `📋 *Стратег составил план*\n\n🎯 Цель: ${run.goal}\n\n📌 ${plan.rationale}\n\n*Задачи (${plan.tasks.length} шт.):*\n${taskList}`,
      [[
        { text: '✅ Одобрить и запустить', callback_data: `approve_plan_${runId}` },
        { text: '❌ Отклонить', callback_data: `reject_plan_${runId}` },
      ]],
    );
  } else {
    queue.schedule(runId);
  }
}

// ── Выполнение ────────────────────────────────────────────────────────────

export async function executeRun(runId: number): Promise<void> {
  await pool.query("UPDATE runs SET status='running', updated_at=NOW() WHERE id=$1", [runId]);
  await pool.query(
    "UPDATE tasks SET status='pending', updated_at=NOW() WHERE run_id=$1 AND status IN ('running','reviewing')",
    [runId],
  );

  const { rows: tasks } = await pool.query<Task>(
    "SELECT * FROM tasks WHERE run_id=$1 AND status NOT IN ('completed','cancelled') ORDER BY position ASC",
    [runId],
  );

  const run = await getRun(runId);
  const projectId = run.project_id ?? undefined;
  await log(runId, null, 'system', 'execution_started',
    `Начало выполнения ${tasks.length} задач. Цель: «${run.goal}»`);

  for (const task of tasks) {
    const budget = await checkBudget(runId);
    if (!budget.ok) {
      await pool.query(
        "UPDATE tasks SET status='cancelled', updated_at=NOW() WHERE run_id=$1 AND status='pending'",
        [runId],
      );
      await pool.query("UPDATE runs SET status='failed', updated_at=NOW() WHERE id=$1", [runId]);
      await log(runId, null, 'system', 'budget_exceeded', budget.msg);
      await createEvent(runId, 'budget_exceeded', { run_id: runId, msg: budget.msg });
      return;
    }
    await processTask(task, projectId);
  }

  await summarizeAndFinish(runId, projectId);
}

// ── Обработка задачи ──────────────────────────────────────────────────────

async function processTask(task: Task, projectId?: number): Promise<void> {
  let currentDescription = task.description;
  const profile = await getProfile(projectId);
  const profileCtx = buildProfileContext(profile);
  // Постоянный контекст проекта для агента-исполнителя
  const pinnedCtx = projectId ? await getPinnedContext(projectId) : '';

  for (let round = 0; round <= MAX_REVISIONS; round++) {
    await updateTask(task.id, { status: 'running' });
    await log(task.run_id, task.id, task.agent_slug, 'task_started',
      `${AGENT_NAMES[task.agent_slug] ?? task.agent_slug} начал работу (раунд ${round})`);

    let execResult: { text: string; inputTokens: number; outputTokens: number; costUsd: number };
    try {
      execResult = await callExecutor({ ...task, description: currentDescription }, round, profileCtx, pinnedCtx);
    } catch (err) {
      await updateTask(task.id, { status: 'completed', critic_verdict: `Ошибка: ${(err as Error).message}` });
      await log(task.run_id, task.id, task.agent_slug, 'task_error', (err as Error).message);
      return;
    }

    await updateTask(task.id, {
      status: 'done',
      result: execResult.text,
      revision_round: round,
      input_tokens: execResult.inputTokens,
      output_tokens: execResult.outputTokens,
      cost_usd: execResult.costUsd,
    });
    await addRunCost(task.run_id, execResult.inputTokens + execResult.outputTokens, execResult.costUsd);
    await log(task.run_id, task.id, task.agent_slug, 'task_done', `Задача выполнена (раунд ${round})`);

    await updateTask(task.id, { status: 'reviewing' });
    const review = await callCritic(currentDescription, execResult.text, profileCtx);
    await addRunCost(task.run_id, review.inputTokens + review.outputTokens, review.costUsd);

    if (review.approved || round >= MAX_REVISIONS) {
      await updateTask(task.id, { status: 'completed', critic_verdict: review.verdict });
      await log(task.run_id, task.id, 'critic',
        review.approved ? 'task_approved' : 'task_force_complete', review.verdict);
      return;
    }

    await updateTask(task.id, { status: 'rejected', critic_verdict: review.verdict });
    await log(task.run_id, task.id, 'critic', 'task_rejected',
      `Раунд ${round}: ${review.feedback}`);

    currentDescription =
      `${task.description}\n\n---\nФИДБЭК КРИТИКА (раунд ${round + 1}):\n${review.feedback}`;
  }
}

// ── Вызов агента-исполнителя ──────────────────────────────────────────────

async function callExecutor(
  task: Task,
  round: number,
  profileCtx: string,
  pinnedCtx: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number; costUsd: number }> {
  const { rows: agentRows } = await pool.query<{ system_prompt: string; name: string }>(
    'SELECT system_prompt, name FROM agents WHERE slug=$1 AND is_active=TRUE',
    [task.agent_slug],
  );
  if (!agentRows.length) throw new Error(`Агент "${task.agent_slug}" не найден или отключён`);

  const agent = agentRows[0];

  let context = '';
  if (task.depends_on?.length > 0) {
    const { rows: depTasks } = await pool.query<{
      agent_slug: string;
      result: string;
    }>('SELECT agent_slug, result FROM tasks WHERE id=ANY($1) AND result IS NOT NULL', [task.depends_on]);
    if (depTasks.length > 0) {
      context =
        '\n\n---\nКОНТЕКСТ ОТ ПРЕДЫДУЩИХ АГЕНТОВ:\n' +
        depTasks.map((d) => `[${AGENT_NAMES[d.agent_slug] ?? d.agent_slug}]:\n${d.result}`).join('\n\n');
    }
  }

  const systemPrompt =
    agent.system_prompt +
    profileCtx +
    pinnedCtx +
    '\n\nТы работаешь в режиме прогона роя. Выполни задачу полностью и верни развёрнутый результат.';

  const userContent =
    round > 0
      ? `ЗАДАЧА (доработка раунд ${round}):\n${task.description}${context}`
      : `ЗАДАЧА:\n${task.description}${context}`;

  const MAX_WEB_ROUNDS = 5;
  let apiMessages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];

  let response = await callWithRetry(() =>
    withTimeout(
      anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: apiMessages,
        tools: [FETCH_URL_TOOL],
      }),
      agent.name,
    )
  );

  let totalInputTokens = response.usage.input_tokens;
  let totalOutputTokens = response.usage.output_tokens;

  // Цикл обработки tool_use: агент может читать страницы до MAX_WEB_ROUNDS раз
  for (let round = 0; round < MAX_WEB_ROUNDS && response.stop_reason === 'tool_use'; round++) {
    const toolCalls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolCalls.map(async (block) => {
        const { url } = block.input as { url: string };
        await log(task.run_id, task.id, task.agent_slug, 'fetch_url', `Читаю страницу: ${url}`);
        const content = await fetchUrlContent(url);
        return { type: 'tool_result' as const, tool_use_id: block.id, content };
      }),
    );

    apiMessages = [
      ...apiMessages,
      { role: 'assistant' as const, content: response.content },
      { role: 'user' as const, content: toolResults },
    ];

    response = await callWithRetry(() =>
      withTimeout(
        anthropic.messages.create({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: apiMessages,
          tools: [FETCH_URL_TOOL],
        }),
        agent.name,
      )
    );

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error(`Агент ${task.agent_slug} не вернул текст`);

  const costUsd = calcCostUsd(totalInputTokens, totalOutputTokens);
  return {
    text: textBlock.text,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd,
  };
}

// ── Вызов Критика ─────────────────────────────────────────────────────────

async function callCritic(
  taskDescription: string,
  result: string,
  profileCtx: string,
): Promise<{ approved: boolean; verdict: string; feedback: string; inputTokens: number; outputTokens: number; costUsd: number }> {
  const { rows } = await pool.query<{ system_prompt: string }>(
    'SELECT system_prompt FROM agents WHERE slug=$1',
    ['critic'],
  );
  const criticSystem =
    (rows[0]?.system_prompt ?? 'Ты — Критик. Оцени результат работы агента.') +
    profileCtx +
    '\n\nДля оценки используй инструмент review_result.';

  const response = await callWithRetry(() =>
    withTimeout(
      anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: criticSystem,
        messages: [{ role: 'user', content: `ЗАДАЧА:\n${taskDescription}\n\nРЕЗУЛЬТАТ:\n${result}` }],
        tools: [REVIEW_TOOL],
        tool_choice: { type: 'tool', name: 'review_result' },
      }),
      'Критик',
    )
  );

  const costUsd = calcCostUsd(response.usage.input_tokens, response.usage.output_tokens);
  const base = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, costUsd };

  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) return { approved: true, verdict: 'Оценка не получена — принято.', feedback: '', ...base };

  const review = toolBlock.input as { approved: boolean; verdict: string; feedback?: string };
  return { approved: review.approved, verdict: review.verdict, feedback: review.feedback ?? '', ...base };
}

// ── Прямая задача агенту (без планирования) ───────────────────────────────

export async function launchSoloTask(opts: {
  agentSlug: string;
  description: string;
  projectId?: number | null;
  budgetUsd?: number;
}): Promise<number> {
  const goal = `[Прямая задача] ${opts.agentSlug}: ${opts.description.substring(0, 120)}`;

  const { rows: runRows } = await pool.query<{ id: number }>(
    `INSERT INTO runs (project_id, goal, status, budget_usd)
     VALUES ($1, $2, 'running', $3) RETURNING id`,
    [opts.projectId ?? null, goal, opts.budgetUsd ?? null],
  );
  const runId = runRows[0].id;

  await pool.query(
    `INSERT INTO tasks (run_id, agent_slug, description, status, position)
     VALUES ($1, $2, $3, 'pending', 0)`,
    [runId, opts.agentSlug, opts.description],
  );

  await log(runId, null, 'system', 'solo_task_created',
    `Прямая задача для ${AGENT_NAMES[opts.agentSlug] ?? opts.agentSlug}: ${opts.description.substring(0, 100)}`);

  queue.schedule(runId);
  return runId;
}

// ── Итоговая сводка ───────────────────────────────────────────────────────

async function summarizeAndFinish(runId: number, projectId?: number): Promise<void> {
  const run = await getRun(runId);
  const { rows: tasks } = await pool.query<Task>(
    'SELECT * FROM tasks WHERE run_id=$1 ORDER BY position ASC',
    [runId],
  );

  await log(runId, null, 'strategist', 'summarizing', 'Стратег пишет итоговую сводку');

  const tasksText = tasks
    .map((t, i) => {
      const name = AGENT_NAMES[t.agent_slug] ?? t.agent_slug;
      const preview = t.result
        ? t.result.substring(0, 300) + (t.result.length > 300 ? '…' : '')
        : 'нет результата';
      return `${i + 1}. [${name}] ${t.description}\nРезультат: ${preview}`;
    })
    .join('\n\n');

  let summary = '';
  try {
    const profile = await getProfile(projectId);
    const profileCtx = buildProfileContext(profile);

    const response = await withTimeout(
      anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SUMMARY_SYSTEM + profileCtx,
        messages: [{ role: 'user', content: `ЦЕЛЬ: ${run.goal}\n\nВЫПОЛНЕННЫЕ ЗАДАЧИ:\n\n${tasksText}` }],
      }),
      'Стратег (сводка)',
    );

    const costUsd = calcCostUsd(response.usage.input_tokens, response.usage.output_tokens);
    await addRunCost(runId, response.usage.input_tokens + response.usage.output_tokens, costUsd);

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    summary = textBlock?.text ?? '';
  } catch {
    summary = `Прогон завершён. Выполнено ${tasks.length} задач.`;
  }

  await pool.query(
    "UPDATE runs SET status='awaiting_review', summary=$1, updated_at=NOW() WHERE id=$2",
    [summary, runId],
  );

  await log(runId, null, 'strategist', 'summary_written', 'Сводка готова');
  await createEvent(runId, 'run_completed', { run_id: runId, task_count: tasks.length });

  // Уведомление с кнопками одобрения
  const summaryShort = summary.substring(0, 450) + (summary.length > 450 ? '…' : '');
  await notifyOwnerWithButtons(
    `✅ *Рой завершил работу — нужна ваша проверка*\n\n🎯 Цель: ${run.goal}\n\n📋 *Итоговая сводка:*\n${summaryShort}`,
    [[
      { text: '✅ Одобрить результат', callback_data: `approve_result_${runId}` },
      { text: '🔄 На доработку', callback_data: `revise_result_${runId}` },
    ]],
  );

  // Полные результаты каждого агента — отдельными сообщениями
  for (const task of tasks) {
    if (!task.result) continue;
    const agentName = AGENT_NAMES[task.agent_slug] ?? task.agent_slug;
    const desc = task.description.substring(0, 60) + (task.description.length > 60 ? '…' : '');
    await notifyOwner(`📄 *${agentName}:* _${desc}_\n\n${task.result}`);
  }
}
