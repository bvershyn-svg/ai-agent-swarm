import pg from 'pg';

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL не задан в .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
try {
  console.log('🗑️  Удаляю таблицы...');
  await pool.query('DROP TABLE IF EXISTS chat_messages CASCADE');
  await pool.query('DROP TABLE IF EXISTS agents CASCADE');
  console.log('✅ Таблицы удалены');
  console.log('ℹ️  Запустите npm run db:setup чтобы пересоздать таблицы');
} finally {
  await pool.end();
}
