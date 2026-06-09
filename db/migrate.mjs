// Запуск: node --env-file=.env db/migrate.mjs
import pg from 'pg';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL не задан в .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  console.log('📋 Применяю миграцию...');
  const sql = await readFile(resolve(__dirname, 'migrate.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Миграция выполнена — таблицы runs, tasks, events, activity_log готовы');
} catch (err) {
  console.error('❌ Ошибка миграции:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
