// Новостная фабрика: пакеты новостей и запуск прогонов
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { planRun } from '../agents/orchestrator';
import type { NewsPackage, NewsItem, Run } from '@swarm/shared';

export const newsRouter = Router();

// Собирает пакет с его элементами из двух таблиц
async function getPackageWithItems(packageId: number): Promise<NewsPackage | null> {
  const { rows: pkgs } = await pool.query<Omit<NewsPackage, 'items'>>(
    'SELECT * FROM news_packages WHERE id = $1',
    [packageId],
  );
  if (!pkgs.length) return null;

  const { rows: items } = await pool.query<NewsItem>(
    'SELECT * FROM news_items WHERE package_id = $1 ORDER BY id ASC',
    [packageId],
  );

  return { ...pkgs[0], items };
}

// GET /api/news/packages — список пакетов проекта
newsRouter.get('/packages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: pkgs } = await pool.query<Omit<NewsPackage, 'items'>>(
      `SELECT np.*,
              (SELECT COUNT(*) FROM news_items ni WHERE ni.package_id = np.id)::int AS item_count
       FROM news_packages np
       WHERE ($1::int IS NULL OR np.project_id = $1)
       ORDER BY np.created_at DESC`,
      [req.projectId ?? null],
    );

    // Для списка — добавляем items в каждый пакет
    const result = await Promise.all(
      pkgs.map(async (pkg) => {
        const { rows: items } = await pool.query<NewsItem>(
          'SELECT * FROM news_items WHERE package_id = $1 ORDER BY id ASC',
          [pkg.id],
        );
        return { ...pkg, items };
      }),
    );

    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/news/packages — создать пакет с элементами
newsRouter.post('/packages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title = '',
      target_date = new Date().toISOString().slice(0, 10),
      region = '',
      languages = [],
      items = [],
    } = req.body as {
      title?: string;
      target_date?: string;
      region?: string;
      languages?: string[];
      items?: Partial<NewsItem>[];
    };

    const { rows: pkgRows } = await pool.query<NewsPackage>(
      `INSERT INTO news_packages (project_id, title, target_date, region, languages)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.projectId ?? null, title, target_date, region, languages],
    );
    const pkg = pkgRows[0];

    const savedItems: NewsItem[] = [];
    for (const item of items) {
      const { rows: itemRows } = await pool.query<NewsItem>(
        `INSERT INTO news_items
           (package_id, category, title, summary, why_important, why_video,
            links, terms, verification_status, virality_score, risks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          pkg.id,
          item.category ?? 'politics',
          item.title ?? '',
          item.summary ?? '',
          item.why_important ?? '',
          item.why_video ?? '',
          item.links ?? [],
          item.terms ?? [],
          item.verification_status ?? 'unverified',
          item.virality_score ?? 5,
          item.risks ?? '',
        ],
      );
      savedItems.push(itemRows[0]);
    }

    res.json({ ...pkg, items: savedItems });
  } catch (e) { next(e); }
});

// GET /api/news/packages/:id
newsRouter.get('/packages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const pkg = await getPackageWithItems(id);
    if (!pkg) { res.status(404).json({ error: 'Пакет не найден' }); return; }

    res.json(pkg);
  } catch (e) { next(e); }
});

// PATCH /api/news/packages/:id — обновить пакет и его элементы
newsRouter.patch('/packages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const { title, target_date, region, languages, status, items } = req.body as {
      title?: string;
      target_date?: string;
      region?: string;
      languages?: string[];
      status?: string;
      items?: Partial<NewsItem>[];
    };

    // Обновляем поля пакета
    const sets: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [id];
    let i = 2;
    if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
    if (target_date !== undefined) { sets.push(`target_date = $${i++}`); vals.push(target_date); }
    if (region !== undefined) { sets.push(`region = $${i++}`); vals.push(region); }
    if (languages !== undefined) { sets.push(`languages = $${i++}`); vals.push(languages); }
    if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }

    await pool.query(`UPDATE news_packages SET ${sets.join(', ')} WHERE id = $1`, vals);

    // Если переданы элементы — полностью заменяем
    if (items !== undefined) {
      await pool.query('DELETE FROM news_items WHERE package_id = $1', [id]);
      for (const item of items) {
        await pool.query(
          `INSERT INTO news_items
             (package_id, category, title, summary, why_important, why_video,
              links, terms, verification_status, virality_score, risks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            id,
            item.category ?? 'politics',
            item.title ?? '',
            item.summary ?? '',
            item.why_important ?? '',
            item.why_video ?? '',
            item.links ?? [],
            item.terms ?? [],
            item.verification_status ?? 'unverified',
            item.virality_score ?? 5,
            item.risks ?? '',
          ],
        );
      }
    }

    const updated = await getPackageWithItems(id);
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/news/packages/:id
newsRouter.delete('/packages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }
    await pool.query('DELETE FROM news_packages WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/news/packages/:id/create-run — запустить прогон из пакета
newsRouter.post('/packages/:id/create-run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Неверный ID' }); return; }

    const pkg = await getPackageWithItems(id);
    if (!pkg) { res.status(404).json({ error: 'Пакет не найден' }); return; }

    const goal = buildNewsPrompt(pkg);

    const { rows: runRows } = await pool.query<Run>(
      "INSERT INTO runs (goal, status, project_id) VALUES ($1, 'planning', $2) RETURNING *",
      [goal, req.projectId ?? null],
    );
    const run = runRows[0];

    await pool.query(
      "UPDATE news_packages SET run_id = $1, status = 'sent_to_run', updated_at = NOW() WHERE id = $2",
      [run.id, id],
    );

    res.json(run);

    planRun(run.id).catch((err: Error) => {
      console.error('Ошибка планирования новостного прогона:', err.message);
      pool.query("UPDATE runs SET status='failed' WHERE id=$1", [run.id]).catch(() => {});
    });
  } catch (e) { next(e); }
});

// ── Генератор промпта из новостного пакета ────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  politics: 'Политическая новость',
  info:     'Информационная / технологическая / медийная новость',
  tabloid:  'Таблоидная / публицистическая / человеческая история',
};

const VERIFICATION_LABELS: Record<string, string> = {
  confirmed:            '✅ Подтверждено',
  partially_confirmed:  '🔵 Частично подтверждено',
  single_source:        '⚠️ Один источник',
  unverified:           '🔴 Не проверено',
};

function buildNewsPrompt(pkg: NewsPackage): string {
  const dateStr = pkg.target_date
    ? new Date(pkg.target_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'сегодня';

  const langStr = pkg.languages?.length ? pkg.languages.join(', ') : 'RU';

  const itemsSections = pkg.items.map((item, i) => {
    const linksStr = item.links?.length
      ? item.links.map((l) => `  - ${l}`).join('\n')
      : '  (не указаны)';
    const termsStr = item.terms?.length
      ? item.terms.map((t) => `  - ${t}`).join('\n')
      : '  (не указаны)';

    return `${i + 1}. ${CATEGORY_LABELS[item.category] ?? item.category}:
Тема: ${item.title}
Кратко: ${item.summary || '—'}
Почему важно: ${item.why_important || '—'}
Почему подходит для видео: ${item.why_video || '—'}
Ссылки:
${linksStr}
Термины для объяснения:
${termsStr}
Статус проверки: ${VERIFICATION_LABELS[item.verification_status] ?? item.verification_status}
Потенциал видео: ${item.virality_score}/10
Риски: ${item.risks || '—'}`;
  }).join('\n\n');

  return `Сделай контент-пакет для ежедневного новостного выпуска.

Дата новостей: ${dateStr}
Фокус: ${pkg.region || 'не указан'}
Языки источников: ${langStr}

Нужно обработать ${pkg.items.length} новост${pkg.items.length === 1 ? 'ь' : pkg.items.length < 5 ? 'и' : 'ей'}:

${itemsSections}

Задача для роя:
Для каждой новости подготовить:
1. Заголовок.
2. Хук на первые 3 секунды.
3. Сценарий короткого видео на 45–60 секунд.
4. Telegram-пост.
5. Описание для Shorts/Reels/TikTok.
6. Визуальный ряд / b-roll.
7. Словарь терминов: объяснить географические локации, организации, аббревиатуры, имена и технологии.
8. Фактчек-блок: что подтверждено, что является заявлением, где нужна осторожность.
9. Оценку рисков публикации.

Стиль:
Русский язык. Живой журналистский тон. Без канцелярита. Объяснять сложное простыми словами, но не примитивно. Можно использовать лёгкую иронию, но не превращать серьёзные новости в клоунаду.

Правило фактчекинга:
Не выдавать заявления одной стороны как подтверждённый факт. Если информация спорная — писать «по данным…», «заявил…», «независимого подтверждения пока нет».

Финальный результат разделить на блоки по каждой новости. В конце выбрать самую сильную тему для короткого видео и объяснить почему.`;
}
