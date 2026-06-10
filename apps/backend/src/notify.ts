// Telegram-уведомления для владельца
import { env } from './env';

type InlineButton = { text: string; callback_data: string };

async function tgPost(token: string, method: string, body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`Telegram ${method} error:`, await res.text());
  } catch (err) {
    console.error(`Telegram ${method} failed:`, (err as Error).message);
  }
}

// Telegram лимит — 4096 символов; разбиваем длинные сообщения
async function sendChunked(chatId: string, token: string, text: string, extra: Record<string, unknown> = {}): Promise<void> {
  const chunks = text.match(/[\s\S]{1,4000}/g) ?? [text];
  for (let i = 0; i < chunks.length; i++) {
    // Кнопки только к последнему чанку
    const body: Record<string, unknown> = { chat_id: chatId, text: chunks[i], parse_mode: 'Markdown' };
    if (i === chunks.length - 1 && Object.keys(extra).length) Object.assign(body, extra);
    await tgPost(token, 'sendMessage', body);
  }
}

// Отправить сообщение владельцу через Telegram Bot
export async function notifyOwner(text: string): Promise<void> {
  const chatId = env.TELEGRAM_OWNER_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) {
    console.log(`📨 [Уведомление] ${text.replace(/\*/g, '')}`);
    return;
  }
  await sendChunked(chatId, token, text);
}

// Отправить сообщение с inline-кнопками (для одобрений)
export async function notifyOwnerWithButtons(
  text: string,
  buttons: InlineButton[][],
): Promise<void> {
  const chatId = env.TELEGRAM_OWNER_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) {
    console.log(`📨 [Уведомление+кнопки] ${text.replace(/\*/g, '')}`);
    return;
  }
  await sendChunked(chatId, token, text, { reply_markup: { inline_keyboard: buttons } });
}

// Отправить файл владельцу через Telegram Bot (sendDocument)
export async function sendDocumentToOwner(
  buffer: Buffer,
  filename: string,
  caption?: string,
  mimeType?: string,
): Promise<void> {
  const chatId = env.TELEGRAM_OWNER_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) {
    console.log(`📎 [Документ] ${filename} (${buffer.length} байт)`);
    return;
  }
  try {
    const type = mimeType ?? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('parse_mode', 'Markdown');
    form.append('document', new Blob([buffer], { type }), filename);
    if (caption) form.append('caption', caption);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) console.error('Telegram sendDocument error:', await res.text());
  } catch (err) {
    console.error('Telegram sendDocument failed:', (err as Error).message);
  }
}

// Опубликовать текст в Telegram-канал
export async function publishToChannel(text: string): Promise<boolean> {
  const channelId = env.TELEGRAM_CHANNEL_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!channelId || !token) return false;
  await sendChunked(channelId, token, text);
  return true;
}
