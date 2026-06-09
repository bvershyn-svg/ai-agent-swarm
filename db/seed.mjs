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
  console.log('🌱 Загружаю начальные данные...');
  const seed = await readFile(resolve(__dirname, 'seed.sql'), 'utf8');
  await pool.query(seed);
  console.log('✅ Данные загружены');
} finally {
  await pool.end();
}
