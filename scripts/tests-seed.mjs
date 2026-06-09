/**
 * Создаёт базовый набор тестовых сценариев для каждого агента.
 *
 * Использование:
 *   npm run tests:seed
 *   npm run tests:seed -- --project=demo
 *
 * Повторный запуск безопасен: уже существующие сценарии пропускаются.
 */

import pg from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; })
);

const PROJECT_SLUG = args['project'] ?? 'demo';
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) { console.error('❌ DATABASE_URL не задан'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ── Базовые сценарии ──────────────────────────────────────────────────────

const SCENARIOS = [
  // Сценарист
  {
    agent_slug: 'scriptwriter',
    name: 'Короткий пост — базовая генерация',
    prompt: 'Напиши короткий пост (2–3 предложения) для Telegram о важности утренней рутины. Тон: живой, мотивирующий.',
    expected: 'Ответ должен содержать пост от 2 до 5 предложений на русском языке с конкретными советами.',
  },
  {
    agent_slug: 'scriptwriter',
    name: 'Сценарий для Reels — структура',
    prompt: 'Напиши сценарий для короткого Reels (15 секунд) на тему: «3 привычки продуктивных людей». Формат: крючок → суть → призыв к действию.',
    expected: 'Ответ должен содержать три части: крючок, основной контент, призыв к действию.',
  },
  {
    agent_slug: 'scriptwriter',
    name: 'Адаптация под аудиторию',
    prompt: 'Перепиши следующий текст для аудитории 18–25 лет (молодые предприниматели): "Систематическое планирование является ключевым фактором успеха в бизнесе."',
    expected: 'Ответ должен быть более разговорным, с молодёжным тоном, но сохранять суть.',
  },

  // Стратег
  {
    agent_slug: 'strategist',
    name: 'Контент-план на неделю',
    prompt: 'Составь контент-план на 5 дней для Telegram-канала о личных финансах. Укажи: день, тему, формат (пост/опрос/Reels).',
    expected: 'Ответ должен содержать таблицу или список с 5 записями, каждая с днём, темой и форматом.',
  },
  {
    agent_slug: 'strategist',
    name: 'Анализ идеи',
    prompt: 'Оцени идею контента: «серия постов о психологии денег». Укажи плюсы, риски и как её можно улучшить.',
    expected: 'Ответ должен содержать структурированный анализ с плюсами и минусами.',
  },

  // Дизайнер
  {
    agent_slug: 'designer',
    name: 'Описание визуала для поста',
    prompt: 'Опиши визуальное оформление для поста о медитации. Укажи: палитру цветов, стиль, элементы, шрифт.',
    expected: 'Ответ должен содержать конкретное описание цветов, стиля и элементов дизайна.',
  },
  {
    agent_slug: 'designer',
    name: 'ТЗ для дизайнера — превью видео',
    prompt: 'Составь техническое задание для дизайнера на превью YouTube-видео: тема «5 ошибок при инвестировании». Размер 1280×720.',
    expected: 'Ответ должен содержать ТЗ с размером, цветами, текстом, расположением элементов.',
  },

  // Публикатор
  {
    agent_slug: 'publisher',
    name: 'Форматирование для Telegram',
    prompt: 'Отформатируй текст для публикации в Telegram с использованием Markdown: "Три правила инвестора: 1) не вкладывай больше чем можешь потерять 2) диверсифицируй портфель 3) играй в долгую".',
    expected: 'Ответ должен использовать Markdown-разметку: жирный текст, списки.',
  },
  {
    agent_slug: 'publisher',
    name: 'Хэштеги и подпись',
    prompt: 'Придумай 5 релевантных хэштегов и подпись (1–2 предложения) для поста о пользе чтения книг по бизнесу.',
    expected: 'Ответ должен содержать ровно 5 хэштегов и краткую подпись.',
  },

  // Критик
  {
    agent_slug: 'critic',
    name: 'Оценка качества поста',
    prompt: 'Оцени этот пост по 5-балльной шкале и дай рекомендации: "Привет всем! Сегодня расскажу про инвестиции. Они бывают разные. Надо инвестировать. Всем удачи!"',
    expected: 'Ответ должен содержать числовую оценку и конкретные замечания.',
  },
  {
    agent_slug: 'critic',
    name: 'Проверка на соответствие тону',
    prompt: 'Проверь, соответствует ли текст тону "профессиональный, но дружелюбный": "Слушай, ну и зачем тебе это вообще знать? Просто делай как я говорю."',
    expected: 'Ответ должен указать на несоответствие тону и предложить правки.',
  },
];

async function run() {
  console.log(`📌 Проект: ${PROJECT_SLUG}`);

  const { rows: projects } = await pool.query('SELECT id FROM projects WHERE slug=$1', [PROJECT_SLUG]);
  if (!projects.length) {
    console.error(`❌ Проект «${PROJECT_SLUG}» не найден.`);
    process.exit(1);
  }
  const projectId = projects[0].id;

  let added = 0;
  let skipped = 0;

  for (const s of SCENARIOS) {
    // Пропускаем если сценарий уже есть (по имени и агенту в этом проекте)
    const { rows: existing } = await pool.query(
      'SELECT id FROM test_scenarios WHERE project_id=$1 AND agent_slug=$2 AND name=$3',
      [projectId, s.agent_slug, s.name],
    );
    if (existing.length) {
      console.log(`  ⏭  ${s.agent_slug} / «${s.name}» — уже существует`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO test_scenarios (project_id, agent_slug, name, prompt, expected)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, s.agent_slug, s.name, s.prompt, s.expected],
    );
    console.log(`  ✅ ${s.agent_slug} / «${s.name}»`);
    added++;
  }

  console.log(`\n🎉 Готово! Добавлено: ${added}, пропущено: ${skipped} (уже существовали)`);
  await pool.end();
}

run().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
