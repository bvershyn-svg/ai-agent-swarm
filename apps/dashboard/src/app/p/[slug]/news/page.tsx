'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getNewsPackages, createNewsPackage, deleteNewsPackage, createRunFromNewsPackage,
  getNewsSources, createNewsSource, updateNewsSource, deleteNewsSource, fetchRssArticles,
} from '@/lib/api';
import type {
  NewsPackage, NewsItem, NewsCategory, NewsVerificationStatus,
  NewsSource, NewsSourceType, RssArticle,
} from '@swarm/shared';

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

const SOURCE_TYPES: { value: NewsSourceType; label: string }[] = [
  { value: 'rss',      label: 'RSS-лента' },
  { value: 'telegram', label: 'Telegram-канал' },
  { value: 'website',  label: 'Сайт' },
  { value: 'youtube',  label: 'YouTube' },
  { value: 'other',    label: 'Другое' },
];

const RELIABILITY_OPTIONS = [
  { value: 'high',   label: '🟢 Высокая', color: 'text-green-400' },
  { value: 'medium', label: '🟡 Средняя', color: 'text-yellow-400' },
  { value: 'low',    label: '🔴 Низкая',  color: 'text-red-400' },
];

const STATUS_LABELS: Record<string, string> = {
  draft:       '✏️ Черновик',
  ready:       '✅ Готов',
  sent_to_run: '🚀 Отправлен',
  archived:    '📦 В архиве',
};

function emptyItem(category: NewsCategory): Partial<NewsItem> {
  return { category, title: '', summary: '', why_important: '', why_video: '',
    links: [], terms: [], verification_status: 'unverified', virality_score: 5, virality_reason: '', risks: '' };
}

// ── RSS-браузер (модалка) ────────────────────────────────────────────────────

function RssModal({
  sources,
  onClose,
  onSelect,
}: {
  sources: NewsSource[];
  onClose: () => void;
  onSelect: (article: RssArticle) => void;
}) {
  const [selectedSource, setSelectedSource] = useState<NewsSource | null>(null);
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const rssSources = sources.filter((s) => s.source_type === 'rss' && s.enabled);

  async function load(url: string, name: string) {
    setLoading(true);
    setError('');
    setArticles([]);
    try {
      const data = await fetchRssArticles(url, name);
      setArticles(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">📡 Найти новости по RSS</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-4 border-b border-gray-700 space-y-3">
          {/* Источники из базы */}
          {rssSources.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Сохранённые RSS-источники:</p>
              <div className="flex flex-wrap gap-2">
                {rssSources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSource(s); load(s.url, s.name); }}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      selectedSource?.id === s.id
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {s.name || s.url}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ручной ввод URL */}
          <div className="flex gap-2">
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Или вставьте URL RSS-ленты напрямую..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => load(customUrl, 'RSS')}
              disabled={!customUrl.trim() || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? '⏳' : '🔍 Загрузить'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <p className="text-gray-500 text-sm text-center py-8">Загружаю статьи...</p>}
          {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">{error}</p>}
          {!loading && articles.length === 0 && !error && (
            <p className="text-gray-600 text-sm text-center py-8">
              {rssSources.length === 0 ? 'Добавьте RSS-источники во вкладке «Источники», или вставьте URL выше' : 'Выберите источник или введите URL'}
            </p>
          )}
          {articles.map((article, i) => (
            <button
              key={i}
              onClick={() => { onSelect(article); onClose(); }}
              className="w-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-lg p-3 transition-colors"
            >
              <p className="text-white text-sm font-medium line-clamp-2">{article.title || '(без заголовка)'}</p>
              {article.description && (
                <p className="text-gray-500 text-xs mt-1 line-clamp-2">{article.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {article.pub_date && <span className="text-gray-600 text-xs">{article.pub_date}</span>}
                {article.link && <span className="text-blue-500 text-xs truncate">{article.link}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Карточка одной новости ───────────────────────────────────────────────────

function NewsItemCard({
  item, index, onChange, onImportFromRss,
}: {
  item: Partial<NewsItem>;
  index: number;
  onChange: (updated: Partial<NewsItem>) => void;
  onImportFromRss: () => void;
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

  function addTerm() {
    const term = prompt('Введите термин или название:');
    if (term?.trim()) set('terms', [...(item.terms ?? []), term.trim()]);
  }

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-800/50 overflow-hidden">
      {/* Шапка карточки */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
        <span className="text-2xl">{cat.emoji}</span>
        <div>
          <p className="text-white font-medium text-sm">{index + 1}. {cat.label}</p>
        </div>
        <button
          onClick={onImportFromRss}
          className="ml-2 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-2 py-1 rounded transition-colors"
        >
          📡 Из RSS
        </button>
        {/* Потенциал */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-500 text-xs">Потенциал:</span>
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5,6,7,8,9,10].map((n) => (
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
          <span className="text-orange-400 text-xs font-bold ml-1">{item.virality_score}/10</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Заголовок */}
        <input
          value={item.title ?? ''}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Заголовок новости..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />

        {/* Краткое описание */}
        <textarea
          value={item.summary ?? ''}
          onChange={(e) => set('summary', e.target.value)}
          placeholder="Краткое описание — что произошло (2–3 предложения)..."
          rows={2}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />

        <div className="grid grid-cols-2 gap-3">
          <textarea
            value={item.why_important ?? ''}
            onChange={(e) => set('why_important', e.target.value)}
            placeholder="Почему важно..."
            rows={2}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
          <textarea
            value={item.why_video ?? ''}
            onChange={(e) => set('why_video', e.target.value)}
            placeholder="Почему подходит для видео..."
            rows={2}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Почему такой потенциал */}
        <input
          value={item.virality_reason ?? ''}
          onChange={(e) => set('virality_reason', e.target.value)}
          placeholder={`Почему потенциал ${item.virality_score}/10? (конфликт, эмоция, визуальность...)`}
          className="w-full bg-gray-900 border border-orange-900/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500"
        />

        <div className="grid grid-cols-2 gap-3">
          {/* Ссылки */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-400">Ссылки на источники</span>
              <button onClick={addLink} className="text-xs text-blue-400 hover:text-blue-300">+ Добавить</button>
            </div>
            <div className="space-y-1 min-h-[28px]">
              {(item.links ?? []).map((link, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-900 rounded px-2 py-1">
                  <span className="text-blue-400 text-xs truncate flex-1">{link}</span>
                  <button onClick={() => set('links', (item.links ?? []).filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
              {!(item.links?.length) && <p className="text-gray-700 text-xs">Нет ссылок</p>}
            </div>
          </div>

          {/* Термины */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-400">Термины для объяснения</span>
              <button onClick={addTerm} className="text-xs text-blue-400 hover:text-blue-300">+ Добавить</button>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[28px]">
              {(item.terms ?? []).map((term, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-700 rounded px-2 py-0.5 text-xs text-gray-300">
                  {term}
                  <button onClick={() => set('terms', (item.terms ?? []).filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400">✕</button>
                </span>
              ))}
              {!(item.terms?.length) && <p className="text-gray-700 text-xs">Нет терминов</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Статус проверки</label>
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
          <div>
            <label className="block text-xs text-gray-400 mb-1">Риски</label>
            <textarea
              value={item.risks ?? ''}
              onChange={(e) => set('risks', e.target.value)}
              placeholder="Что нужно проверить..."
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

function NewPackageForm({ onSaved, onCancel, sources }: {
  onSaved: () => void;
  onCancel: () => void;
  sources: NewsSource[];
}) {
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));
  const [region, setRegion] = useState('Украина + Польша + Европа');
  const [languages, setLanguages] = useState<string[]>(['RU', 'UA']);
  const [items, setItems] = useState<Partial<NewsItem>[]>([
    emptyItem('politics'), emptyItem('info'), emptyItem('tabloid'),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rssTargetIndex, setRssTargetIndex] = useState<number | null>(null);

  function toggleLang(lang: string) {
    setLanguages((prev) => prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]);
  }

  function importArticle(index: number, article: RssArticle) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const links = article.link ? [article.link, ...(item.links ?? [])] : (item.links ?? []);
      return {
        ...item,
        title: article.title || item.title,
        summary: article.description || item.summary,
        links: [...new Set(links)],
      };
    }));
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
    <div className="space-y-5">
      {rssTargetIndex !== null && (
        <RssModal
          sources={sources}
          onClose={() => setRssTargetIndex(null)}
          onSelect={(article) => { importArticle(rssTargetIndex, article); setRssTargetIndex(null); }}
        />
      )}

      {/* Параметры */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-4">
        <h3 className="text-white font-semibold text-sm">📋 Параметры выпуска</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Название (необязательно)</label>
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
            <label className="block text-xs text-gray-400 mb-1">Регион</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {['Украина','Польша','Европа','Мир','Украина + Польша + Европа'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Языки источников</label>
            <div className="flex gap-2">
              {['RU','UA','PL','EN'].map((lang) => (
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
            onChange={(updated) => setItems((prev) => prev.map((x, j) => j === i ? updated : x))}
            onImportFromRss={() => setRssTargetIndex(i)}
          />
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? '⏳ Сохраняю...' : '💾 Сохранить пакет'}
        </button>
        <button onClick={onCancel} className="px-5 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
          Отмена
        </button>
      </div>
    </div>
  );
}

// ── Карточка сохранённого пакета ─────────────────────────────────────────────

function PackageCard({ pkg, onDelete, onLaunch }: {
  pkg: NewsPackage;
  onDelete: () => void;
  onLaunch: () => void;
}) {
  const dateStr = pkg.target_date
    ? new Date(pkg.target_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : '—';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-white font-medium">{pkg.title || `Выпуск ${dateStr}`}</span>
            <span className="text-xs text-gray-500">{dateStr}</span>
            <span className="text-xs text-gray-500">{STATUS_LABELS[pkg.status] ?? pkg.status}</span>
          </div>
          {pkg.region && <p className="text-gray-500 text-xs mb-2">📍 {pkg.region}</p>}
          <div className="space-y-1">
            {pkg.items.map((item, i) => {
              const cat = CATEGORIES.find((c) => c.value === item.category);
              const ver = VERIFICATION_OPTIONS.find((v) => v.value === item.verification_status);
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>{cat?.emoji}</span>
                  <span className="text-gray-300 truncate flex-1">{item.title || '(без заголовка)'}</span>
                  {ver && <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${ver.color}`}>{ver.label}</span>}
                  <span className="text-orange-400 text-xs shrink-0">{item.virality_score}/10</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={onLaunch}
            disabled={pkg.status === 'sent_to_run'}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            🚀 {pkg.status === 'sent_to_run' ? 'Отправлен' : 'В прогон'}
          </button>
          <button
            onClick={() => { if (confirm('Удалить пакет?')) onDelete(); }}
            className="text-gray-500 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-red-900/20"
          >
            🗑 Удалить
          </button>
        </div>
      </div>
      {pkg.run_id && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <a href={`runs/${pkg.run_id}`} className="text-xs text-blue-400 hover:text-blue-300">
            → Открыть прогон #{pkg.run_id}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Управление источниками ────────────────────────────────────────────────────

function SourcesTab() {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState<Partial<NewsSource>>({
    name: '', url: '', source_type: 'rss', language: 'ru', category: 'general', reliability: 'medium',
  });
  const [saving, setSaving] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testArticles, setTestArticles] = useState<RssArticle[]>([]);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');

  useEffect(() => {
    getNewsSources().then(setSources).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!newSource.url?.trim()) return;
    setSaving(true);
    try {
      const src = await createNewsSource(newSource);
      setSources((prev) => [src, ...prev]);
      setNewSource({ name: '', url: '', source_type: 'rss', language: 'ru', category: 'general', reliability: 'medium' });
      setShowAdd(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(source: NewsSource) {
    try {
      const updated = await updateNewsSource(source.id, { enabled: !source.enabled });
      setSources((prev) => prev.map((s) => s.id === source.id ? updated : s));
    } catch (e) { alert((e as Error).message); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить источник?')) return;
    try {
      await deleteNewsSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) { alert((e as Error).message); }
  }

  async function handleTest() {
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestError('');
    setTestArticles([]);
    try {
      const data = await fetchRssArticles(testUrl.trim(), 'Тест');
      setTestArticles(data);
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const reliabilityLabel = (r: string) => RELIABILITY_OPTIONS.find((o) => o.value === r)?.label ?? r;

  return (
    <div className="space-y-5">
      {/* Тест RSS */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
        <h3 className="text-white font-semibold text-sm">🧪 Проверить RSS-ленту</h3>
        <div className="flex gap-2">
          <input
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="Вставьте URL RSS-ленты для проверки..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleTest}
            disabled={!testUrl.trim() || testing}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {testing ? '⏳' : '🔍 Проверить'}
          </button>
        </div>
        {testError && <p className="text-red-400 text-sm">{testError}</p>}
        {testArticles.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            <p className="text-green-400 text-xs">✅ Найдено {testArticles.length} статей</p>
            {testArticles.slice(0, 5).map((a, i) => (
              <p key={i} className="text-gray-400 text-xs truncate">• {a.title}</p>
            ))}
          </div>
        )}
      </div>

      {/* Список источников */}
      <div className="flex items-center justify-between">
        <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
          Источники ({sources.length})
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          {showAdd ? 'Отмена' : '+ Добавить источник'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Название</label>
              <input
                value={newSource.name ?? ''}
                onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))}
                placeholder="Reuters, BBC Ukraina..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">URL</label>
              <input
                value={newSource.url ?? ''}
                onChange={(e) => setNewSource((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://example.com/rss.xml"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Тип</label>
              <select
                value={newSource.source_type ?? 'rss'}
                onChange={(e) => setNewSource((p) => ({ ...p, source_type: e.target.value as NewsSourceType }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Надёжность</label>
              <select
                value={newSource.reliability ?? 'medium'}
                onChange={(e) => setNewSource((p) => ({ ...p, reliability: e.target.value as NewsSource['reliability'] }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {RELIABILITY_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Язык</label>
              <select
                value={newSource.language ?? 'ru'}
                onChange={(e) => setNewSource((p) => ({ ...p, language: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {['ru','ua','pl','en'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !newSource.url?.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? '⏳' : '💾 Сохранить источник'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-600 text-sm">Загружаю...</p>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-3xl">📡</p>
          <p className="text-gray-500 text-sm">Источников пока нет</p>
          <p className="text-gray-600 text-xs">Добавьте RSS-ленты для быстрого импорта новостей</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
              <button
                onClick={() => handleToggle(s)}
                className={`w-8 h-5 rounded-full transition-colors shrink-0 ${s.enabled ? 'bg-green-600' : 'bg-gray-600'}`}
                title={s.enabled ? 'Отключить' : 'Включить'}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{s.name || s.url}</span>
                  <span className="text-xs text-gray-500">{SOURCE_TYPES.find((t) => t.value === s.source_type)?.label}</span>
                  <span className="text-xs">{reliabilityLabel(s.reliability)}</span>
                  <span className="text-xs text-gray-600 uppercase">{s.language}</span>
                </div>
                {s.name && <p className="text-gray-600 text-xs truncate">{s.url}</p>}
              </div>
              <button onClick={() => handleDelete(s.id)} className="text-gray-600 hover:text-red-400 text-sm transition-colors">🗑</button>
            </div>
          ))}
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

  const [tab, setTab] = useState<'packages' | 'sources'>('packages');
  const [packages, setPackages] = useState<NewsPackage[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pkgs, srcs] = await Promise.all([getNewsPackages(), getNewsSources()]);
      setPackages(pkgs);
      setSources(srcs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number) {
    try {
      await deleteNewsPackage(id);
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch (e) { alert((e as Error).message); }
  }

  async function handleLaunch(pkg: NewsPackage) {
    try {
      const run = await createRunFromNewsPackage(pkg.id);
      setPackages((prev) => prev.map((p) => p.id === pkg.id ? { ...p, status: 'sent_to_run', run_id: run.id } : p));
      router.push(`/p/${slug}/runs/${run.id}`);
    } catch (e) { alert((e as Error).message); }
  }

  const TAB_STYLE = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Заголовок */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🗞 Новостная фабрика</h1>
          <p className="text-gray-500 text-sm mt-1">
            Собирайте пакеты из 3 новостей и запускайте рой для создания Shorts / Reels / Telegram
          </p>
        </div>
        {tab === 'packages' && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Создать пакет
          </button>
        )}
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('packages')} className={TAB_STYLE(tab === 'packages')}>
          📦 Пакеты {packages.length > 0 && `(${packages.length})`}
        </button>
        <button onClick={() => setTab('sources')} className={TAB_STYLE(tab === 'sources')}>
          📡 Источники {sources.length > 0 && `(${sources.length})`}
        </button>
      </div>

      {/* Вкладка: Пакеты */}
      {tab === 'packages' && (
        <>
          {showForm && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">📦 Новый пакет новостей</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
              </div>
              <NewPackageForm
                sources={sources}
                onSaved={() => { setShowForm(false); load(); }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}

          {loading ? (
            <div className="text-gray-500 text-sm py-8 text-center">Загружаю...</div>
          ) : packages.length === 0 && !showForm ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-5xl">🗞</p>
              <p className="text-gray-400 text-lg">Пакетов новостей пока нет</p>
              <p className="text-gray-600 text-sm">Создайте первый пакет — 3 новости → рой → сценарий</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
              >
                ➕ Создать пакет
              </button>
            </div>
          ) : (
            <div className="space-y-3">
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
        </>
      )}

      {/* Вкладка: Источники */}
      {tab === 'sources' && <SourcesTab />}
    </div>
  );
}
