// Запуск: node --env-file=.env scripts/telegram-chat-id.mjs
// Показывает chat_id последнего входящего сообщения боту

const { TELEGRAM_BOT_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

console.log('📬 Получаю обновления бота...');
console.log('   Если ничего нет — напишите боту любое сообщение и повторите.\n');

try {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=10`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok) {
    console.error('❌ Ошибка Telegram:', data.description);
    process.exit(1);
  }

  if (!data.result || data.result.length === 0) {
    console.log('⚠️  Нет входящих сообщений.');
    console.log('   1. Найдите своего бота в Telegram');
    console.log('   2. Напишите ему что-нибудь (например: "Привет")');
    console.log('   3. Запустите эту команду снова');
    process.exit(0);
  }

  const messages = data.result
    .filter(u => u.message)
    .map(u => ({
      chat_id: u.message.chat.id,
      from: u.message.from?.first_name ?? 'Неизвестно',
      text: u.message.text ?? '(не текст)',
    }));

  if (messages.length === 0) {
    console.log('⚠️  Обновления есть, но без текстовых сообщений. Напишите боту текст.');
    process.exit(0);
  }

  const last = messages[messages.length - 1];
  console.log(`✅ Нашёл сообщение от ${last.from}: "${last.text}"`);
  console.log(`\n📋 Ваш TELEGRAM_OWNER_CHAT_ID = ${last.chat_id}`);
  console.log(`\nДобавьте в .env:`);
  console.log(`TELEGRAM_OWNER_CHAT_ID=${last.chat_id}`);
} catch (err) {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
}
