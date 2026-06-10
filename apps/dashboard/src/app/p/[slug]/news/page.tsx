'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getNewsPackages,
  createNewsPackage,
  updateNewsPackage,
  deleteNewsPackage,
  createRunFromNewsPackage,
} from '@/lib/api';
import type { NewsPackage, NewsItem, NewsCategory, NewsVerificationStatus } from '@swarm/shared';

// ── Константы ───────────────────────────────────────────────────────────────

const CATEGORIES: { value: NewsCategory; label: string; emoji: string }[] = [
  { value: 'politics', label: 'Политика',           emoji: '🏛' },
  { value: 'info',     label: 'Инфо / технологии',  emoji: '💡' },
  { value: 'tabloid',  label: 'Таблоид / истории',  emoji: '📰' },
];

const VERIFICATION_OPTIONS: { value: NewsVerificationStatus; label: string; color: string }[] = [
  { value: 'confirmed',           label: 'Подтверждено',          color: 'text-green-400 bg-green-900/30 border-green-700' },
  { value: 'partially_confirmed', label: 'Частично подтверждено', color: 'text-blue-400 bg-blue-900/30 border-blue-700' },
  { value: 'single_source',       label: 'Один источник',         color: 'text-yellow-400 bg-yellow-900/30 border-yellow-700' },
  { value: 'unverified',          label: 'Не проверено',          color: 'text-red-400 bg-red-900/30 border-red-700' },
];

const STATUS_LABELS: Record<string, string> = {
  draft:        '✏️ Черновик',
  ready:        '✅ Готов',
  sent_to_run:  '🚀 Отправлен',
  archived:     '📦 В архиве',
};

// ── Пустая карточка новости ─────────────────────────────────────────────────

function emptyItem(category: NewsCategory): Partial<NewsItem> {
  return {
    category,
    title: '',
    summary: '',
    why_important: '',
    why_video: '',
    links: [],
    terms: [],
    verification_status: 'unverified',
    virality_score: 5,
    risks: '',
  };
}

// ── Компонент карточки одной новости ────────────────────────────────────────

function NewsItemCard({
  item,
  index,
  onChange,
}: {
  item: Partial<NewsItem>;
  index: number;
  onChange: (updated: Partial<NewsItem>) => void;
}) {
  const cat = CATEGORIES.find((c) => c.value === item.category) ?? CATEGORIES[0];
  const verification = VERIFICATION_OPTIONS.find((v) => v.value === item.verification_status);

  function set<K extends keyof NewsItem>(key: K, value: NewsItem[K]) {
    onChange({ ...item, [key]: value });
  }

  function addLink() {
    const url = prompt('Вставьте URL ссылки:');
    if (url?.trim()) set('links', [...(item.links ?? []), url.trim()]);
  }

  function removeLink(i: number) {
    set('links', (item.links ?? []).filter((_, idx) => idx !== i));
  }

  function addTerm() {
    const term = prompt('Введите термин или название:');
    if (term?.trim()) set('terms', [...(item.terms ?? []), term.trim()]);
  }

  function removeTerm(i: number) {
    set('terms', (item.terms ?? []).filter((_, idx) => idx !== i));
  }

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-800/50 overflow-hidden">
      {/* Заголовок карточки */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
        <span className="text-2xl">{cat.emoji}</span>
        <div>
          <p className="text-white font-medium text-sm">{index + 1}. {cat.label}</p>
          <p className="text-gray-500 text-xs">Новость #{index + 1}</p>
        </div>
        {/* Потенциал видео */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-500 text-xs">Потенциал:</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => set('virality_score', n)}
                className={`w-5 h-5 rounded text-xs font-bold transition-colors ${
                  n <= (item.virality_score ?? 5)
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-orange-400 text-xs font-bold">{item.virality_score}/10</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Заголовок */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Заголовок новости</label>
          <input
            value={item.title ?? ''}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Кратко о чём новость..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Краткое описание */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Краткое описание</label>
          <textarea
            value={item.summary ?? ''}
            onChange={(e) => set('summary', e.target.value)}
            placeholder="Что произошло, 2-3 предложения..."
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Почему важно */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Почему важно</label>
            <textarea
              value={item.why_important ?? ''}
              onChange={(e) => set('why_important', e.target.value)}
              placeholder="Контекст и значимость..."
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Почему подходит для видео */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Почему подходит для видео</label>
            <textarea
              value={item.why_video ?? ''}
              onChange={(e) => set('why_video', e.target.value)}
              placeholder="Визуальность, эмоция, конфликт..."
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Ссылки */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Ссылки на источники</label>
              <button onClick={addLink} className="text-xs text-blue-400 hover:text-blue-300">+ Добавить</button>
            </div>
            <div className="space-y-1">
              {(item.links ?? []).map((link, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-900 rounded px-2 py-1">
                  <span className="text-blue-400 text-xs truncate flex-1">{link}</span>
                  <button onClick={() => removeLink(i)} className="text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button>
                </div>
              ))}
              {!(item.links?.length) && (
                <p className="text-gray-700 text-xs py-1">Нет ссылок</p>
              )}
            </div>
          </div>

          {/* Термины */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Термины для объяснения</label>
              <button onClick={addTerm} className="text-xs text-blue-400 hover:text-blue-300">+ Добавить</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {(item.terms ?? []).map((term, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-700 rounded px-2 py-0.5 text-xs text-gray-300">
                  {term}
                  <button onClick={() => removeTerm(i)} className="text-gray-500 hover:text-red-400">✕</button>
                </span>
              ))}
              {!(item.terms?.length) && (
                <p className="text-gray-700 text-xs py-1">Нет терминов</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Статус проверки */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Статус проверки источников</label>
            <select
              value={item.verification_status ?? 'unverified'}
              onChange={(e) => set('verification_status', e.target.value as NewsVerificationStatus)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {VERIFICATION_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
            {verification && (
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded border ${verification.color}`}>
                {verification.label}
              </span>
            )}
          </div>

          {/* Риски */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Риски и оговорки</label>
            <textarea
              value={item.risks ?? ''}
              onChange={(e) => set('risks', e.target.value)}
              placeholder="Что нужно проверить, где осторожность..."
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Форма создания пакета ────────────────────────────────────────────────────

function NewPackageForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));
  const [region, setRegion] = useState('Украина + Польша + Европа');
  const [languages, setLanguages] = useState<string[]>(['RU', 'UA']);
  const [items, setItems] = useState<Partial<NewsItem>[]>([
    emptyItem('politics'),
    emptyItem('info'),
    emptyItem('tabloid'),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const LANG_OPTIONS = ['RU', 'UA', 'PL', 'EN'];

  function toggleLang(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  function updateItem(index: number, updated: Partial<NewsItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? updated : item)));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await createNewsPackage({ title, target_date: targetDate, region, languages, items });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Мета-данные пакета */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h3 className="text-white font-semibold">📋 Параметры выпуска</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Название пакета (необязательно)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Выпуск ${new Date().toLocaleDateString('ru-RU')}`}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Дата новостей</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Регион / фокус</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option>Украина</option>
              <option>Польша</option>
              <option>Европа</option>
              <option>Мир</option>
              <option>Украина + Польша + Европа</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Языки источников</label>
            <div className="flex gap-2">
              {LANG_OPTIONS.map((lang) => (
                <button
                  key={lang}
                  onClick={() => toggleLang(lang)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    languages.includes(lang)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Карточки новостей */}
      <div className="space-y-4">
        {items.map((item, i) => (
          <NewsItemCard
            key={i}
            item={item}
            index={i}
            onChange={(updated) => updateItem(i, updated)}
          />
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Кнопки */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? '⏳ Сохраняю...' : '💾 Сохранить пакет'}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

// ── Карточка сохранённого пакета ─────────────────────────────────────────────

function PackageCard({
  pkg,
  onDelete,
  onLaunch,
}: {
  pkg: NewsPackage;
  onDelete: () => void;
  onLaunch: () => void;
}) {
  const [launching, setLaunching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleLaunch() {
    setLaunching(true);
    try { onLaunch(); } finally { setLaunching(false); }
  }

  async function handleDelete() {
    if (!confirm('Удалить этот пакет новостей?')) return;
    setDeleting(true);
    try { onDelete(); } finally { setDeleting(false); }
  }

  const dateStr = pkg.target_date
    ? new Date(pkg.target_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : '—';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-medium truncate">
              {pkg.title || `Выпуск ${dateStr}`}
            </span>
            <span className="text-xs text-gray-500 shrink-0">{dateStr}</span>
            <span className="text-xs text-gray-500 shrink-0">{STATUS_LABELS[pkg.status] ?? pkg.status}</span>
          </div>

          {pkg.region && (
            <p className="text-gray-500 text-xs mb-2">📍 {pkg.region}</p>
          )}

          {/* Новости в пакете */}
          <div className="space-y-1">
            {pkg.items.map((item, i) => {
              const cat = CATEGORIES.find((c) => c.value === item.category);
              const ver = VERIFICATION_OPTIONS.find((v) => v.value === item.verification_status);
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>{cat?.emoji}</span>
                  <span className="text-gray-300 truncate flex-1">{item.title || '(без заголовка)'}</span>
                  {ver && (
                    <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${ver.color}`}>
                      {ver.label}
                    </span>
                  )}
                  <span className="text-orange-400 text-xs shrink-0">{item.virality_score}/10</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={handleLaunch}
            disabled={launching || pkg.status === 'sent_to_run'}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            {launching ? '⏳' : '🚀'} {pkg.status === 'sent_to_run' ? 'Отправлен' : 'В прогон'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs transition-colors"
          >
            🗑 Удалить
          </button>
        </div>
      </div>

      {pkg.run_id && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <a
            href={`runs/${pkg.run_id}`}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            → Открыть прогон #{pkg.run_id}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Главная страница ─────────────────────────────────────────────────────────

export default function NewsPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [packages, setPackages] = useState<NewsPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getNewsPackages();
      setPackages(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number) {
    try {
      await deleteNewsPackage(id);
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleLaunch(pkg: NewsPackage) {
    try {
      const run = await createRunFromNewsPackage(pkg.id);
      setPackages((prev) =>
        prev.map((p) => (p.id === pkg.id ? { ...p, status: 'sent_to_run', run_id: run.id } : p)),
      );
      router.push(`/p/${slug}/runs/${run.id}`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🗞 Новостная фабрика</h1>
          <p className="text-gray-500 text-sm mt-1">
            Собирайте пакеты новостей и превращайте их в сценарии для Shorts / Reels / Telegram
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Создать пакет
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Форма создания */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">📦 Новый новостной пакет</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white text-sm">✕ Закрыть</button>
          </div>
          <NewPackageForm
            onSaved={() => { setShowForm(false); load(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Список пакетов */}
      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">Загружаю...</div>
      ) : packages.length === 0 && !showForm ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-5xl">🗞</p>
          <p className="text-gray-400 text-lg">Пакетов новостей пока нет</p>
          <p className="text-gray-600 text-sm">Создайте первый пакет — добавьте 3 новости и отправьте рою</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Создать пакет новостей
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.length > 0 && (
            <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
              Сохранённые пакеты ({packages.length})
            </h2>
          )}
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onDelete={() => handleDelete(pkg.id)}
              onLaunch={() => handleLaunch(pkg)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
