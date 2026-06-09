import { Pool } from 'pg';
import { env } from './env';

// Единый пул соединений — создаётся один раз при старте сервера
export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Ошибка PostgreSQL:', err.message);
});
