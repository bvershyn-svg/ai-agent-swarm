// Резервная копия базы данных — хранит последние 14 дампов
// Запуск: node --env-file=.env db/backup.mjs
import { execSync } from 'child_process';
import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL не задан в .env');
  process.exit(1);
}

// Парсим параметры подключения из DATABASE_URL
const url = new URL(DATABASE_URL);
const host     = url.hostname;
const port     = url.port || '5432';
const user     = url.username;
const password = url.password;
const dbname   = url.pathname.slice(1);

// Ищем pg_dump: сначала в портативной установке, потом в PATH
const pgDumpPaths = [
  'D:\\pgsql\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
  'pg_dump',
];

let pgDump = 'pg_dump';
for (const p of pgDumpPaths) {
  if (p === 'pg_dump' || existsSync(p)) {
    pgDump = p.includes(' ') ? `"${p}"` : p;
    break;
  }
}

// Создаём папку backups/
const backupsDir = resolve(__dirname, '..', 'backups');
mkdirSync(backupsDir, { recursive: true });

// Имя файла: swarm-2026-06-09T14-30-00.sql
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = resolve(backupsDir, `swarm-${timestamp}.sql`);

try {
  console.log(`📦 Создаю резервную копию...`);
  process.env.PGPASSWORD = password;
  execSync(
    `${pgDump} -h ${host} -p ${port} -U ${user} ${dbname} > "${filename}"`,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(`✅ Резервная копия: backups/swarm-${timestamp}.sql`);
} catch (err) {
  console.error('❌ Ошибка при создании резервной копии:', err.message);
  process.exit(1);
}

// Удаляем старые дампы — оставляем последние 14
const MAX_BACKUPS = 14;
const files = readdirSync(backupsDir)
  .filter(f => f.startsWith('swarm-') && f.endsWith('.sql'))
  .sort();

if (files.length > MAX_BACKUPS) {
  const toDelete = files.slice(0, files.length - MAX_BACKUPS);
  toDelete.forEach(f => {
    unlinkSync(resolve(backupsDir, f));
    console.log(`🗑  Удалена старая копия: ${f}`);
  });
}

console.log(`📂 Всего резервных копий: ${Math.min(files.length, MAX_BACKUPS)}`);
