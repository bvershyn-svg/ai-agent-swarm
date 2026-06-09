'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getKnowledgeSources, deleteKnowledgeSource } from '@/lib/api';
import type { KnowledgeSource } from '@swarm/shared';

export default function ProjectKnowledgePage() {
  const { slug } = useParams<{ slug: string }>();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getKnowledgeSources()
      .then(setSources)
      .catch(() => setError('Не удалось загрузить базу знаний'))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleDelete(id: number) {
    if (!confirm('Удалить источник знаний?')) return;
    try {
      await deleteKnowledgeSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">📚 База знаний</h1>
        <p className="text-gray-500 text-sm mt-1">
          Документы и материалы, которые агенты используют при работе
        </p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}

      <div className="bg-gray-800 border border-blue-900/50 rounded-xl p-4 mb-6 text-sm text-blue-300">
        <p className="font-medium mb-1">📌 Как добавить материалы</p>
        <p className="text-blue-400 text-xs">
          Запустите в терминале: <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono">npm run knowledge:ingest -- --dir=путь/к/папке --project={slug}</code>
        </p>
      </div>

      {sources.length === 0 ? (
        <div className="text-center text-gray-500 mt-10">
          <p className="text-4xl mb-3">📭</p>
          <p>База знаний пуста.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{source.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {source.source_type} · {new Date(source.created_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <button
                onClick={() => handleDelete(source.id)}
                className="text-red-400 hover:text-red-300 text-xs px-3 py-1.5 rounded-lg border border-red-900 transition-colors shrink-0"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
