'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getRuns, getRunDetail, approveResult, requestRevision } from '@/lib/api';
import type { RunDetail } from '@/lib/api';

export default function ReviewPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<RunDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReviews = useCallback(async () => {
    try {
      const runs = await getRuns();
      const pending = runs.filter(r => r.status === 'awaiting_review');
      const details = await Promise.all(pending.map(r => getRunDetail(r.id)));
      setReviews(details);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📋 На проверке</h1>
        <p className="text-gray-500 text-sm mt-1">Результаты работы роя — одобрите или отправьте на доработку</p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}

      {reviews.length === 0 && !loading && (
        <div className="text-center text-gray-500 mt-20">
          <div className="text-4xl mb-4">✅</div>
          <p>Нет прогонов, ожидающих проверки</p>
          <button
            onClick={() => router.push('/runs')}
            className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline"
          >
            Перейти к прогонам
          </button>
        </div>
      )}

      <div className="space-y-6">
        {reviews.map(detail => (
          <ReviewCard
            key={detail.run.id}
            detail={detail}
            onAction={loadReviews}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ detail, onAction }: { detail: RunDetail; onAction: () => void }) {
  const router = useRouter();
  const { run, tasks } = detail;
  const [comment, setComment] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleApprove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await approveResult(run.id);
      onAction();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function handleRevision() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const newRun = await requestRevision(run.id, comment.trim());
      router.push(`/runs/${newRun.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Шапка */}
      <div className="p-5 border-b border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{run.goal}</h2>
            <p className="text-gray-500 text-xs mt-1">
              #{run.id} · {completedCount} из {tasks.length} задач
            </p>
          </div>
          <button
            onClick={() => router.push(`/runs/${run.id}`)}
            className="text-gray-500 hover:text-white text-xs transition-colors"
          >
            Детали →
          </button>
        </div>
      </div>

      {/* Итоговая сводка */}
      {run.summary && (
        <div className="p-5 border-b border-gray-700">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Итоговая сводка от Стратега</p>
          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{run.summary}</p>
        </div>
      )}

      {/* Список задач (свёрнутый) */}
      <div className="p-5 border-b border-gray-700">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Выполненные задачи</p>
        <div className="space-y-3">
          {tasks.slice(0, 5).map(task => (
            <div key={task.id} className="text-sm">
              <p className="text-gray-400 font-medium mb-1">{task.agent_slug}: {task.description.substring(0, 80)}…</p>
              {task.result && (
                <p className="text-gray-500 line-clamp-2">{task.result.substring(0, 200)}</p>
              )}
            </div>
          ))}
          {tasks.length > 5 && (
            <button
              onClick={() => router.push(`/runs/${run.id}`)}
              className="text-blue-400 hover:text-blue-300 text-xs underline"
            >
              + ещё {tasks.length - 5} задач
            </button>
          )}
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="p-5">
        {error && <p className="text-red-400 text-sm mb-3">⚠️ {error}</p>}

        {!showRevisionForm ? (
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={busy}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {busy ? 'Обрабатываю…' : '✅ Одобрить'}
            </button>
            <button
              onClick={() => setShowRevisionForm(true)}
              disabled={busy}
              className="bg-orange-800 hover:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              🔄 На доработку
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-400 mb-2">
              Опишите что нужно улучшить (будет создан новый прогон):
            </p>
            <textarea
              className="w-full bg-gray-900 text-gray-100 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm placeholder-gray-600 mb-3"
              rows={3}
              placeholder="Например: Добавь больше конкретных примеров, сделай тон более неформальным…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={busy}
            />
            <div className="flex gap-3">
              <button
                onClick={handleRevision}
                disabled={busy}
                className="bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {busy ? 'Создаю прогон…' : '🔄 Запустить доработку'}
              </button>
              <button
                onClick={() => { setShowRevisionForm(false); setComment(''); }}
                disabled={busy}
                className="text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
