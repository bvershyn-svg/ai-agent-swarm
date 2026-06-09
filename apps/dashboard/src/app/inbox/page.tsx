'use client';

import { useState, useEffect } from 'react';
import { getInbox, addIdea, launchIdeaAsRun, rejectIdea } from '@/lib/api';
import type { IdeaInboxItem } from '@swarm/shared';

export default function InboxPage() {
  const [ideas, setIdeas] = useState<IdeaInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [adding, setAdding] = useState(false);
  const [launching, setLaunching] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await getInbox();
      setIdeas(data);
    } catch {
      setError('Не удалось загрузить инбокс');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newIdea.trim() || adding) return;
    setAdding(true);
    try {
      const item = await addIdea(newIdea.trim());
      setIdeas((prev) => [item, ...prev]);
      setNewIdea('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleLaunch(id: number) {
    if (launching) return;
    setLaunching(id);
    try {
      await launchIdeaAsRun(id);
      setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, status: 'in_progress' as const } : i));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLaunching(null);
    }
  }

  async function handleReject(id: number) {
    try {
      await rejectIdea(id);
      setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, status: 'rejected' as const } : i));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pending = ideas.filter(i => i.status === 'new' || i.status === 'in_progress');
  const launched = ideas.filter(i => i.status === 'done');
  const rejected = ideas.filter(i => i.status === 'rejected');

  if (loading) return <div className="p-6 text-gray-500 w-full">Загрузка…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">💡 Инбокс идей</h1>
        <p className="text-gray-500 text-sm mt-1">
          Копите идеи — запускайте в прогон одним кликом
        </p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}

      {/* Форма добавления */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
        <textarea
          rows={3}
          placeholder="Напишите идею для контента или задачу для агентов…"
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
          disabled={adding}
          className="w-full bg-gray-900 text-gray-100 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600 mb-3"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newIdea.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {adding ? 'Добавляю…' : 'Добавить идею'}
        </button>
      </div>

      {/* Ожидающие */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Ждут решения ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onLaunch={handleLaunch}
                onReject={handleReject}
                launching={launching === idea.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Запущенные */}
      {launched.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Выполнены ({launched.length})
          </h2>
          <div className="space-y-2">
            {launched.map((idea) => (
              <div key={idea.id} className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-4">
                <p className="text-sm text-gray-400 line-clamp-2">{idea.text}</p>
                <p className="text-xs text-green-500 mt-1">✓ Запущено в прогон</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Отклонённые */}
      {rejected.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Отклонены ({rejected.length})
          </h2>
          <div className="space-y-2">
            {rejected.map((idea) => (
              <div key={idea.id} className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4">
                <p className="text-sm text-gray-600 line-clamp-2">{idea.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {ideas.length === 0 && (
        <div className="text-center text-gray-500 mt-16">
          <div className="text-4xl mb-4">💡</div>
          <p>Инбокс пуст. Добавьте первую идею!</p>
        </div>
      )}
    </div>
  );
}

function IdeaCard({
  idea, onLaunch, onReject, launching,
}: {
  idea: IdeaInboxItem;
  onLaunch: (id: number) => void;
  onReject: (id: number) => void;
  launching: boolean;
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <p className="text-sm text-gray-200 mb-3">{idea.text}</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">
          {new Date(idea.created_at).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
          {idea.source && <span className="ml-2">· {idea.source}</span>}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onReject(idea.id)}
            className="text-gray-500 hover:text-red-400 text-xs px-3 py-1 rounded-lg transition-colors"
          >
            Отклонить
          </button>
          <button
            onClick={() => onLaunch(idea.id)}
            disabled={launching}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs px-4 py-1.5 rounded-lg font-medium transition-colors"
          >
            {launching ? '…' : '🚀 В прогон'}
          </button>
        </div>
      </div>
    </div>
  );
}
