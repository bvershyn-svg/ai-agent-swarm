// Telegram-уведомления для владельца
import { env } from './env';

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!res.ok) console.error('Telegram error:', await res.text());
  } catch (err) {
    console.error('Telegram send failed:', (err as Error).message);
  }
}

// Отправить сообщение владельцу через Telegram Bot
export async function notifyOwner(text: string): Promise<void> {
  const chatId = env.TELEGRAM_OWNER_CHAT_ID;
  if (!chatId) {
    console.log(`📨 [Уведомление] ${text.replace(/\*/g, '')}`);
    return;
  }
  await sendTelegramMessage(chatId, text);
}

// Опубликовать текст в Telegram-канал
export async function publishToChannel(text: string): Promise<boolean> {
  const channelId = env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return false;
  await sendTelegramMessage(channelId, text);
  return true;
}
