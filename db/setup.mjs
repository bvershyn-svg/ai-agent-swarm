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

// Разбираем URL чтобы узнать имя БД и пользователя
const url = new URL(DATABASE_URL);
const targetDb = url.pathname.slice(1); // убираем начальный /
const appUser = url.username;
const appPassword = url.password;
const host = url.hostname;
const port = parseInt(url.port || '5432');

// 1. Подключаемся под суперпользователем postgres для создания БД и пользователя
const adminPool = new pg.Pool({
  host, port,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
});

try {
  console.log('🔧 Создаю пользователя и базу данных...');

  // Создаём пользователя если не существует
  const userExists = await adminPool.query(
    `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`,
    [appUser]
  );
  if (userExists.rowCount === 0) {
    // Используем pg.Client.escapeIdentifier не доступен напрямую, поэтому доверяем фиксированным значениям из .env
    await adminPool.query(`CREATE USER "${appUser}" WITH PASSWORD '${appPassword}'`);
    console.log(`✅ Пользователь "${appUser}" создан`);
  } else {
    console.log(`ℹ️  Пользователь "${appUser}" уже существует`);
  }

  // Создаём базу данных если не существует
  const dbExists = await adminPool.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [targetDb]
  );
  if (dbExists.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${targetDb}" OWNER "${appUser}"`);
    console.log(`✅ База данных "${targetDb}" создана`);
  } else {
    console.log(`ℹ️  База данных "${targetDb}" уже существует`);
  }

  await adminPool.query(`GRANT ALL PRIVILEGES ON DATABASE "${targetDb}" TO "${appUser}"`);

} finally {
  await adminPool.end();
}

// 2. Применяем схему и начальные данные
const appPool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  console.log('📋 Применяю схему таблиц...');
  const schema = await readFile(resolve(__dirname, 'schema.sql'), 'utf8');
  await appPool.query(schema);
  console.log('✅ Схема применена');

  console.log('🌱 Загружаю начальные данные...');
  const seed = await readFile(resolve(__dirname, 'seed.sql'), 'utf8');
  await appPool.query(seed);
  console.log('✅ Данные загружены');

  console.log('\n🎉 База данных готова к работе!');
} finally {
  await appPool.end();
}
