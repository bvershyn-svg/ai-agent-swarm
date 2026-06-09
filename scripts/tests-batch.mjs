/**
 * Запускает пакет тестов: для каждого сценария отправляет запрос агенту
 * и оценивает ответ с помощью Claude-критика.
 *
 * Использование:
 *   npm run tests:batch
 *   npm run tests:batch -- --limit=10
 *   npm run tests:batch -- --project=demo --limit=5
 *   npm run tests:batch -- --agent=scriptwriter
 *
 * Алгоритм:
 *   1. Берём незапускавшиеся (или все с --rerun) сценарии
 *   2. Для каждого вызываем Claude с system_prompt агента
 *   3. Оцениваем ответ: если есть expected — просим Claude проверить соответствие
 *   4. Записываем результат в test_runs
 */

import pg from 'pg';
import Anthropic from '@anthropic-ai/sdk';

// ── Аргументы ─────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; })
);

const PROJECT_SLUG = args['project'] ?? 'demo';
const LIMIT        = parseInt(args['limit'] ?? '20');
const AGENT_FILTER = args['agent'] ?? null;
const RERUN        = 'rerun' in args;
const MODEL        = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const { DATABASE_URL, ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN } = process.env;
if (!DATABASE_URL) { console.error('❌ DATABASE_URL не задан'); process.exit(1); }

// Настраиваем Anthropic (API-ключ или OAuth-токен)
if (!ANTHROPIC_API_KEY && CLAUDE_CODE_OAUTH_TOKEN) {
  process.env.ANTHROPIC_AUTH_TOKEN = CLAUDE_CODE_OAUTH_TOKEN;
}
if (!ANTHROPIC_API_KEY && !CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('❌ ANTHROPIC_API_KEY или CLAUDE_CODE_OAUTH_TOKEN не заданы в .env');
  process.exit(1);
}

const anthropic = new Anthropic();
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ── Запрос к агенту ───────────────────────────────────────────────────────

async function askAgent(systemPrompt, userPrompt) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = resp.content[0]?.text ?? '';
  const cost = (resp.usage.input_tokens * 3 + resp.usage.output_tokens * 15) / 1_000_000;
  return { text, cost };
}

// ── Оценка ответа ─────────────────────────────────────────────────────────

async function evaluateResponse(userPrompt, agentResponse, expected) {
  if (!expected?.trim()) {
    // Без критерия — просто проверяем что ответ не пустой и содержательный
    const ok = agentResponse.trim().length > 50;
    return { verdict: ok ? 'pass' : 'fail', note: ok ? 'Ответ содержательный' : 'Ответ слишком короткий' };
  }

  const evalPrompt = `Оцени ответ агента.

ЗАДАНИЕ ПОЛЬЗОВАТЕЛЯ:
${userPrompt}

ОТВЕТ АГЕНТА:
${agentResponse}

КРИТЕРИЙ УСПЕХА:
${expected}

Ответь строго в формате JSON:
{"verdict": "pass" | "fail", "note": "краткое объяснение (1 предложение)"}

Только JSON, без лишнего текста.`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: evalPrompt }],
    });
    const json = JSON.parse(resp.content[0]?.text ?? '{}');
    const verdict = json.verdict === 'pass' ? 'pass' : 'fail';
    const note = String(json.note ?? '').substring(0, 300);
    return { verdict, note };
  } catch {
    // Если Claude не вернул валидный JSON — считаем fail
    return { verdict: 'fail', note: 'Ошибка при оценке ответа' };
  }
}

// ── Основная логика ───────────────────────────────────────────────────────

async function run() {
  console.log(`\n📌 Проект: ${PROJECT_SLUG}`);
  console.log(`🔢 Лимит: ${LIMIT} тестов`);
  if (AGENT_FILTER) console.log(`🤖 Агент: ${AGENT_FILTER}`);
  if (RERUN) console.log(`♻️  Режим: перезапуск всех сценариев`);
  console.log('');

  // Проект
  const { rows: projects } = await pool.query('SELECT id FROM projects WHERE slug=$1', [PROJECT_SLUG]);
  if (!projects.length) {
    console.error(`❌ Проект «${PROJECT_SLUG}» не найден.`);
    process.exit(1);
  }
  const projectId = projects[0].id;

  // Выбираем сценарии
  let query, queryArgs;

  if (RERUN) {
    query = `SELECT s.*, ag.system_prompt
             FROM test_scenarios s
             LEFT JOIN agents ag ON ag.slug = s.agent_slug
             WHERE (s.project_id = $1 OR s.project_id IS NULL)
             ${AGENT_FILTER ? 'AND s.agent_slug = $2' : ''}
             ORDER BY s.id
             LIMIT ${LIMIT}`;
    queryArgs = AGENT_FILTER ? [projectId, AGENT_FILTER] : [projectId];
  } else {
    // Только сценарии без ни одного запуска
    query = `SELECT s.*, ag.system_prompt
             FROM test_scenarios s
             LEFT JOIN agents ag ON ag.slug = s.agent_slug
             WHERE (s.project_id = $1 OR s.project_id IS NULL)
               AND NOT EXISTS (SELECT 1 FROM test_runs r WHERE r.scenario_id = s.id AND r.project_id = $1)
               ${AGENT_FILTER ? 'AND s.agent_slug = $2' : ''}
             ORDER BY s.id
             LIMIT ${LIMIT}`;
    queryArgs = AGENT_FILTER ? [projectId, AGENT_FILTER] : [projectId];
  }

  const { rows: scenarios } = await pool.query(query, queryArgs);

  if (!scenarios.length) {
    console.log('✅ Нечего запускать: все сценарии уже были протестированы.');
    console.log('   Используйте --rerun чтобы перезапустить все.');
    await pool.end();
    return;
  }

  console.log(`📋 Найдено сценариев: ${scenarios.length}\n`);

  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const num = `[${i + 1}/${scenarios.length}]`;

    // Если агент не найден в БД — используем дефолтный промпт
    const systemPrompt = s.system_prompt
      || `Ты ${s.agent_slug} — ИИ-агент команды по работе с социальными сетями. Отвечай на русском языке, чётко и профессионально.`;

    console.log(`${num} ${s.agent_slug} / «${s.name}»`);

    // Создаём запись о запуске
    const { rows: runRows } = await pool.query(
      `INSERT INTO test_runs (scenario_id, project_id, status) VALUES ($1, $2, 'running') RETURNING id`,
      [s.id, projectId],
    );
    const testRunId = runRows[0].id;

    const startMs = Date.now();

    try {
      // Спрашиваем агента
      const { text: response, cost } = await askAgent(systemPrompt, s.prompt);
      const durationMs = Date.now() - startMs;

      // Оцениваем ответ
      const { verdict, note } = await evaluateResponse(s.prompt, response, s.expected);

      // Сохраняем результат
      await pool.query(
        `UPDATE test_runs
         SET status='done', response=$1, verdict=$2, verdict_note=$3, cost_usd=$4, duration_ms=$5
         WHERE id=$6`,
        [response, verdict, note, cost, durationMs, testRunId],
      );

      const icon = verdict === 'pass' ? '✅' : '❌';
      console.log(`   ${icon} ${verdict.toUpperCase()} (${durationMs}ms) — ${note}`);

      if (verdict === 'pass') passed++; else failed++;

    } catch (err) {
      const durationMs = Date.now() - startMs;
      await pool.query(
        `UPDATE test_runs SET status='failed', verdict='fail', verdict_note=$1, duration_ms=$2 WHERE id=$3`,
        [err.message?.substring(0, 300) ?? 'Неизвестная ошибка', durationMs, testRunId],
      );
      console.log(`   💥 ОШИБКА: ${err.message}`);
      errors++;
    }

    // Небольшая пауза чтобы не превысить rate limit
    if (i < scenarios.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Итого: ${passed} ✅ прошло, ${failed} ❌ упало, ${errors} 💥 ошибок`);
  const total = passed + failed + errors;
  if (total > 0) {
    const pct = Math.round(passed / total * 100);
    console.log(`📈 Успешность: ${pct}%`);
  }
  console.log('');

  await pool.end();
}

run().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
