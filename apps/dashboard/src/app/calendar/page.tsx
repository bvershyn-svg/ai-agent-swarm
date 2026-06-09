'use client';

import { useState, useEffect } from 'react';
import { getContentPlan, updateContentPlan, deleteContentPlan, addToContentPlan } from '@/lib/api';
import type { ContentPlanItem } from '@swarm/shared';

const PLATFORM_LABEL: Record<string, string> = {
  youtube: '▶ YouTube',
  telegram: '✈ Telegram',
  instagram: '📷 Instagram',
  general: '🌐 Общее',
};

const STATUS_OPTIONS = [
  { value: 'planned', label: '📌 Запланировано' },
  { value: 'in_progress', label: '⚡ В работе' },
  { value: 'published', label: '✅ Опубликовано' },
  { value: 'cancelled', label: '❌ Отменено' },
];

type PlanWithDraft = ContentPlanItem & { draft_content?: string };

export default function CalendarPage() {
  const [items, setItems] = useState<PlanWithDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ title: '', platform: 'general', scheduled_at: '', notes: '' });
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await getContentPlan();
      setItems(data);
    } catch {
      setError('Не удалось загрузить контент-план');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    try {
      const updated = await updateContentPlan(id, { status: status as ContentPlanItem['status'] });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updated } : i)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDateChange(id: number, scheduled_at: string) {
    try {
      const updated = await updateContentPlan(id, { scheduled_at: scheduled_at || undefined });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updated } : i)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить запись из плана?')) return;
    try {
      await deleteContentPlan(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (expanded === id) setExpanded(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleAdd() {
    if (!newItem.title.trim()) return;
    setAdding(true);
    try {
      const created = await addToContentPlan(newItem);
      setItems((prev) => [...prev, created]);
      setNewItem({ title: '', platform: 'general', scheduled_at: '', notes: '' });
      setShowAdd(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleCopy(id: number, content: string) {
    await navigator.clipboard.writeText(content).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function formatDate(dt?: string | null) {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;
  if (error) return <div className="p-6 text-red-400">⚠️ {error}</div>;

  const grouped: Record<string, PlanWithDraft[]> = {};
  for (const item of items) {
    const key = item.scheduled_at
      ? new Date(item.scheduled_at).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'Без даты';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📅 Контент-план</h1>
          <p className="text-gray-500 text-sm mt-1">Расписание публикаций и автоматических черновиков</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          + Добавить
        </button>
      </div>

      {/* Форма добавления */}
      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6 space-y-3">
          <h3 className="font-semibold text-sm text-gray-300">Новая запись</h3>

          <input
            type="text"
            placeholder="Название публикации"
            value={newItem.title}
            onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex gap-3">
            <select
              value={newItem.platform}
              onChange={(e) => setNewItem((p) => ({ ...p, platform: e.target.value }))}
              className="bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none flex-1"
            >
              {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>

            <input
              type="datetime-local"
              value={newItem.scheduled_at}
              onChange={(e) => setNewItem((p) => ({ ...p, scheduled_at: e.target.value }))}
              className="bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none flex-1"
            />
          </div>

          <textarea
            rows={2}
            placeholder="Заметки…"
            value={newItem.notes}
            onChange={(e) => setNewItem((p) => ({ ...p, notes: e.target.value }))}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={adding || !newItem.title.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {adding ? 'Добавляю…' : 'Добавить'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="text-gray-500 hover:text-gray-300 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center text-gray-500 mt-20">
          <p className="text-4xl mb-3">📭</p>
          <p>Контент-план пуст.</p>
          <p className="text-sm mt-1">Добавьте записи вручную или одобрите прогон с задачами Публикатора.</p>
        </div>
      )}

      {/* Группировка по датам */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([dateLabel, group]) => (
          <div key={dateLabel}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 capitalize">
              {dateLabel}
            </h2>
            <div className="space-y-2">
              {group.map((item) => (
                <div key={item.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  {/* Строка элемента */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-750 transition-colors"
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                          {PLATFORM_LABEL[item.platform] ?? item.platform}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.status === 'published' ? 'bg-green-900 text-green-300' :
                          item.status === 'in_progress' ? 'bg-blue-900 text-blue-300' :
                          item.status === 'cancelled' ? 'bg-red-900 text-red-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {STATUS_OPTIONS.find((s) => s.value === item.status)?.label ?? item.status}
                        </span>
                        <span className="text-xs text-gray-600">{formatDate(item.scheduled_at)}</span>
                      </div>
                      <p className="text-sm text-gray-200 font-medium truncate">{item.title}</p>
                    </div>
                    {item.draft_content && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(item.id, item.draft_content!); }}
                        className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded transition-colors shrink-0"
                      >
                        {copied === item.id ? '✓' : '📋'}
                      </button>
                    )}
                    <span className="text-gray-600 text-lg shrink-0">{expanded === item.id ? '▲' : '▼'}</span>
                  </div>

                  {/* Раскрытая карточка */}
                  {expanded === item.id && (
                    <div className="border-t border-gray-700 p-4 space-y-3">
                      <div className="flex gap-3 flex-wrap">
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          className="bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>

                        <input
                          type="datetime-local"
                          value={item.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0, 16) : ''}
                          onChange={(e) => handleDateChange(item.id, e.target.value)}
                          className="bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        />

                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-red-400 hover:text-red-300 px-4 py-2 rounded-lg text-sm transition-colors ml-auto"
                        >
                          Удалить
                        </button>
                      </div>

                      {item.notes && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Заметки</p>
                          <p className="text-sm text-gray-400">{item.notes}</p>
                        </div>
                      )}

                      {item.draft_content && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-gray-500">Текст черновика</p>
                            <button
                              onClick={() => handleCopy(item.id, item.draft_content!)}
                              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                              {copied === item.id ? '✓ Скопировано' : '📋 Скопировать'}
                            </button>
                          </div>
                          <pre className="text-xs text-gray-300 bg-gray-900 rounded-lg p-3 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                            {item.draft_content}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
