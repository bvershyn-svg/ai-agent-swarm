/**
 * UTF-8 аналог curl для тестирования API прямо из терминала.
 * Работает корректно с кириллицей на Windows.
 *
 * Использование:
 *   npm run api -- GET projects
 *   npm run api -- GET agents demo
 *   npm run api -- POST inbox demo '{"text":"Привет"}'
 *   npm run api -- DELETE inbox/1 demo
 *
 * Аргументы:
 *   1. HTTP-метод (GET, POST, PATCH, DELETE)
 *   2. Путь API (начинается с /)
 *   3. (необязательно) Slug проекта для заголовка X-Project
 *   4. (необязательно) JSON-тело запроса (строка или @файл)
 */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

const [,, method = 'GET', rawPath = 'health', ...rest] = process.argv;

// Git Bash на Windows конвертирует /api/... в C:/Git/api/...
// Нормализуем: убираем всё до первого /api/ или принимаем без слэша
let path;
const apiIdx = rawPath.indexOf('/api/');
if (apiIdx !== -1) {
  path = rawPath.slice(apiIdx);          // D:/Git/api/projects → /api/projects
} else if (rawPath.startsWith('/')) {
  path = rawPath;                         // уже правильный путь
} else {
  path = '/api/' + rawPath.replace(/^api\//, '');  // projects → /api/projects
}

// Парсим остальные аргументы: проект и тело
let projectSlug = null;
let body = null;

for (const arg of rest) {
  if (arg.startsWith('{') || arg.startsWith('[')) {
    body = arg;
  } else if (arg.startsWith('@')) {
    // @файл — читаем тело из файла
    const { readFileSync } = await import('fs');
    body = readFileSync(arg.slice(1), 'utf8');
  } else {
    projectSlug = arg;
  }
}

const headers = { 'Accept': 'application/json' };
if (projectSlug) headers['X-Project'] = projectSlug;
if (body) headers['Content-Type'] = 'application/json';

const password = process.env.SWARM_PASSWORD;
if (password) headers['Authorization'] = `Bearer ${password}`;

const url = `${BACKEND}${path}`;
console.error(`\n→ ${method} ${url}${projectSlug ? ` [project: ${projectSlug}]` : ''}`);

try {
  const res = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: body ?? undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  let data;

  if (contentType.includes('application/json')) {
    data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    data = await res.text();
    console.log(data);
  }

  if (!res.ok) {
    console.error(`\n← HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  } else {
    console.error(`← HTTP ${res.status} OK`);
  }
} catch (err) {
  console.error('❌ Ошибка запроса:', err.message);
  process.exit(1);
}
