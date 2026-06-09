'use client';

import { useState, useEffect } from 'react';
import { getDrafts, updateDraft, deleteDraft } from '@/lib/api';
import type { ContentDraft } from '@swarm/shared';

const PLATFORM_LABEL: Record<string, string> = {
  youtube: '▶ YouTube',
  telegram: '✈ Telegram',
  instagram: '📷 Instagram',
  general: '🌐 Общее',
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'approved', label: 'Готово к публикации' },
  { value: 'published', label: 'Опубликовано' },
];

export default function TasksPage() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    getDrafts()
      .then(setDrafts)
      .catch(() => setError('Не удалось загрузить черновики'))
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id: number, content: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      if (!(id in editContent)) setEditContent((p) => ({ ...p, [id]: content }));
    }
  }

  async function handleSave(draft: ContentDraft) {
    setSaving(draft.id);
    try {
      const updated = await updateDraft(draft.id, {
        content: editContent[draft.id] ?? draft.content,
      });
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? updated : d)));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function handleStatusChange(draft: ContentDraft, status: string) {
    try {
      const updated = await updateDraft(draft.id, { status: status as ContentDraft['status'] });
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? updated : d)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить этот черновик?')) return;
    try {
      await deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      if (expanded === id) setExpanded(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleCopy(id: number, content: string) {
    await navigator.clipboard.writeText(content).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;
  if (error) return <div className="p-6 text-red-400">⚠️ {error}</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📝 Черновики</h1>
          <p className="text-gray-500 text-sm mt-1">
            Контент, автоматически созданный агентами после одобрения прогонов
          </p>
        </div>
        <span className="text-gray-500 text-sm">{drafts.length} шт.</span>
      </div>

      {drafts.length === 0 && (
        <div className="text-center text-gray-500 mt-20">
          <p className="text-4xl mb-3">📭</p>
          <p>Черновиков пока нет.</p>
          <p className="text-sm mt-1">Они появятся после одобрения прогонов с задачами Публикатора.</p>
        </div>
      )}

      <div className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {/* Шапка черновика */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-750 transition-colors"
              onClick={() => toggleExpand(draft.id, draft.content)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                    {PLATFORM_LABEL[draft.platform] ?? draft.platform}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    draft.status === 'published' ? 'bg-green-900 text-green-300' :
                    draft.status === 'approved' ? 'bg-blue-900 text-blue-300' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {STATUS_OPTIONS.find((s) => s.value === draft.status)?.label ?? draft.status}
                  </span>
                  {draft.run_id && (
                    <span className="text-xs text-gray-600">Прогон #{draft.run_id}</span>
                  )}
                </div>
                <p className="text-sm text-gray-200 font-medium truncate">{draft.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(draft.id, draft.content); }}
                  className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded transition-colors"
                  title="Скопировать текст"
                >
                  {copied === draft.id ? '✓ Скопировано' : '📋 Копировать'}
                </button>
                <span className="text-gray-600 text-lg">{expanded === draft.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Раскрытая карточка */}
            {expanded === draft.id && (
              <div className="border-t border-gray-700 p-4 space-y-3">
                <textarea
                  rows={10}
                  value={editContent[draft.id] ?? draft.content}
                  onChange={(e) => setEditContent((p) => ({ ...p, [draft.id]: e.target.value }))}
                  className="w-full bg-gray-900 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                />

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => handleSave(draft)}
                    disabled={saving === draft.id}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {saving === draft.id ? 'Сохраняю…' : 'Сохранить'}
                  </button>

                  <select
                    value={draft.status}
                    onChange={(e) => handleStatusChange(draft, e.target.value)}
                    className="bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleCopy(draft.id, editContent[draft.id] ?? draft.content)}
                    className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    {copied === draft.id ? '✓ Скопировано' : '📋 Скопировать'}
                  </button>

                  <button
                    onClick={() => handleDelete(draft.id)}
                    className="text-red-400 hover:text-red-300 px-4 py-2 rounded-lg text-sm transition-colors ml-auto"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
