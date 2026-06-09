import path from 'path';
import { config } from 'dotenv';

// Загружаем .env из корня монорепозитория (три уровня вверх от apps/backend/src/)
config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

// Если нет API-ключа, но есть OAuth-токен — прописываем его в ANTHROPIC_AUTH_TOKEN,
// который Anthropic SDK подхватит автоматически
if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  process.env.ANTHROPIC_AUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Переменная ${name} не задана в .env`);
  return val;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  DATABASE_URL:             required('DATABASE_URL'),
  BACKEND_PORT:             parseInt(optional('BACKEND_PORT', '4000')),
  ANTHROPIC_MODEL:          optional('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
  ANTHROPIC_API_KEY:        optional('ANTHROPIC_API_KEY'),
  CLAUDE_CODE_OAUTH_TOKEN:  optional('CLAUDE_CODE_OAUTH_TOKEN'),
  TELEGRAM_BOT_TOKEN:       optional('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_OWNER_CHAT_ID:   optional('TELEGRAM_OWNER_CHAT_ID'),
  TELEGRAM_CHANNEL_ID:      optional('TELEGRAM_CHANNEL_ID'),
  SWARM_PASSWORD:           optional('SWARM_PASSWORD'),
};
