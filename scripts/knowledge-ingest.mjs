/**
 * Загружает файлы из папки в базу знаний проекта.
 *
 * Использование:
 *   npm run knowledge:ingest -- --dir=./my-docs --project=demo
 *   npm run knowledge:ingest -- --dir=./my-docs --project=demo --chunk-size=800
 *
 * Поддерживаемые форматы: .txt, .md, .csv
 */

import pg from 'pg';
import { readdir, readFile } from 'fs/promises';
import { resolve, extname, basename } from 'path';

// ── Аргументы командной строки ─────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [key, ...val] = a.slice(2).split('=');
      return [key, val.join('=')];
    })
);

const DIR          = args['dir'];
const PROJECT_SLUG = args['project'] ?? 'demo';
const CHUNK_SIZE   = parseInt(args['chunk-size'] ?? '600');
const CHUNK_OVERLAP = parseInt(args['overlap'] ?? '80');

if (!DIR) {
  console.error('❌ Укажите папку: --dir=путь/к/папке');
  process.exit(1);
}

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL не задан в .env');
  process.exit(1);
}

// ── Утилиты ────────────────────────────────────────────────────────────────

/**
 * Нарезает текст на чанки с перекрытием.
 * Старается разбивать по абзацам, а не по середине слов.
 */
function chunkText(text, size, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + size;

    // Пробуем закончить на конце абзаца или предложения
    if (end < text.length) {
      const nearEnd = text.slice(end - 50, end + 50);
      const breakAt = nearEnd.lastIndexOf('\n\n');
      if (breakAt >= 0) {
        end = end - 50 + breakAt + 2;
      } else {
        const sentBreak = nearEnd.lastIndexOf('. ');
        if (sentBreak >= 0) end = end - 50 + sentBreak + 2;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);

    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

// ── Основная логика ────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function run() {
  const dirPath = resolve(DIR);
  console.log(`📂 Папка: ${dirPath}`);
  console.log(`📌 Проект: ${PROJECT_SLUG}`);
  console.log(`✂️  Размер чанка: ${CHUNK_SIZE} симв., перекрытие: ${CHUNK_OVERLAP}`);

  // Находим проект
  const { rows: projects } = await pool.query(
    'SELECT id FROM projects WHERE slug=$1',
    [PROJECT_SLUG],
  );
  if (!projects.length) {
    console.error(`❌ Проект «${PROJECT_SLUG}» не найден. Доступные проекты:`);
    const { rows: all } = await pool.query('SELECT slug, name FROM projects');
    all.forEach(p => console.log(`   • ${p.slug} — ${p.name}`));
    process.exit(1);
  }
  const projectId = projects[0].id;

  // Читаем файлы
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && ['.txt', '.md', '.csv'].includes(extname(e.name).toLowerCase()))
    .map(e => e.name);

  if (!files.length) {
    console.warn('⚠️  Файлов .txt/.md/.csv не найдено в папке.');
    process.exit(0);
  }

  console.log(`\n📄 Найдено файлов: ${files.length}\n`);

  let totalChunks = 0;

  for (const filename of files) {
    const filePath = resolve(dirPath, filename);
    const name = basename(filename);

    const text = await readFile(filePath, 'utf8');
    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);

    if (!chunks.length) {
      console.log(`  ⏭  ${name} — пустой файл, пропуск`);
      continue;
    }

    // Удаляем старый источник с тем же путём, если есть
    await pool.query(
      'DELETE FROM knowledge_sources WHERE project_id=$1 AND path=$2',
      [projectId, filePath],
    );

    // Создаём новый источник
    const { rows: src } = await pool.query(
      `INSERT INTO knowledge_sources (project_id, name, source_type, path, chunk_count)
       VALUES ($1, $2, 'file', $3, $4) RETURNING id`,
      [projectId, name, filePath, chunks.length],
    );
    const sourceId = src[0].id;

    // Вставляем чанки пачками
    for (let i = 0; i < chunks.length; i++) {
      const metadata = { filename, chunk_index: i, total_chunks: chunks.length };
      await pool.query(
        'INSERT INTO knowledge_chunks (source_id, project_id, content, metadata) VALUES ($1, $2, $3, $4)',
        [sourceId, projectId, chunks[i], JSON.stringify(metadata)],
      );
    }

    totalChunks += chunks.length;
    console.log(`  ✅ ${name} — ${chunks.length} чанков`);
  }

  console.log(`\n🎉 Готово! Загружено ${totalChunks} чанков из ${files.length} файлов в проект «${PROJECT_SLUG}».`);

  await pool.end();
}

run().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
