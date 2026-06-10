// Инструмент для чтения веб-страниц по URL
import type Anthropic from '@anthropic-ai/sdk';

export const FETCH_URL_TOOL: Anthropic.Tool = {
  name: 'fetch_url',
  description:
    'Загружает веб-страницу по URL и возвращает её текстовое содержимое. ' +
    'Используй когда нужно прочитать конкретную статью, сайт конкурента, новость или любую страницу из интернета.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'Полный URL страницы (начинается с http:// или https://)',
      },
    },
    required: ['url'],
  },
};

const MAX_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchUrlContent(url: string): Promise<string> {
  try {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return `Ошибка: некорректный URL — «${url}»`;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'Ошибка: поддерживаются только http:// и https://';
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SwarmBot/1.0)',
        Accept: 'text/html,text/plain,*/*',
        'Accept-Language': 'ru,en;q=0.9',
      },
    });

    if (!res.ok) {
      return `Ошибка загрузки: HTTP ${res.status} ${res.statusText}`;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/')) {
      return `Ошибка: неподдерживаемый тип файла — ${contentType}`;
    }

    const html = await res.text();
    const text = htmlToText(html);
    const truncated =
      text.length > MAX_CHARS
        ? text.substring(0, MAX_CHARS) + `\n\n[... текст обрезан, всего ${text.length} символов]`
        : text;

    return `Страница: ${url}\n\n${truncated}`;
  } catch (err) {
    const e = err as Error;
    if (e.name === 'TimeoutError' || e.message?.includes('timeout')) {
      return `Ошибка: сайт не ответил за ${FETCH_TIMEOUT_MS / 1000} секунд`;
    }
    return `Ошибка загрузки страницы: ${e.message ?? 'неизвестная ошибка'}`;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|main|nav|aside)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
