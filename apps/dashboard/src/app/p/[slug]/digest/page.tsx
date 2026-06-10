'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getRuns, getDrafts, approvePlan, approveResult, publishDraftToTelegram, sendAllDraftsToMe } from '@/lib/api';
import type { RunListItem } from '@/lib/api';
import type { ContentDraft } from '@swarm/shared';

const PLATFORM_EMOJI: Record<string, string> = {
  telegram: '✈️', instagram: '📸', youtube: '▶️', general: '📝',
};

const STATUS_LABEL: Record<string, string> = {
  planning: 'Планирование…',
  running: 'Работает…',
  awaiting_approval: 'Ждёт одобрения плана',
  awaiting_review: 'Ждёт вашей проверки',
  completed: 'Завершён',
  failed: 'Ошибка',
};

export default function DigestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [publishMsg, setPublishMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllMsg, setSendAllMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getRuns(), getDrafts()])
      .then(([r, d]) => { setRuns(r); setDrafts(d); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Автообновление пока есть активные прогоны
    const interval = setInterval(() => {
      const hasActive = runs.some(r =>
        r.status === 'planning' || r.status === 'running' ||
        r.status === 'awaiting_approval' || r.status === 'awaiting_review'
      );
      if (hasActive) load();
    }, 15_000);
    return () => clearInterval(interval);
  }, [runs.length]);

  const needsApproval = runs.filter(r => r.status === 'awaiting_approval');
  const needsReview   = runs.filter(r => r.status === 'awaiting_review');
  const inProgress    = runs.filter(r => r.status === 'running' || r.status === 'planning');
  const completed     = runs.filter(r => r.status === 'completed');
  const pendingDrafts = drafts.filter(d => d.status === 'draft');

  // «Не готово» = всё что требует действия или в процессе
  const notReadyCount = needsApproval.length + needsReview.length + inProgress.length;
  // «Готово» = завершённые + черновики к публикации
  const readyCount = completed.length + pendingDrafts.length;

  async function handleApprovePlan(id: number) {
    setActioning(id);
    try {
      await approvePlan(id);
      setRuns(prev => prev.map(r => r.id === id ? { ...r, status: 'running' as const } : r));
    } finally { setActioning(null); }
  }

  async function handleApproveResult(id: number) {
    setActioning(id);
    try {
      await approveResult(id);
      setRuns(prev => prev.map(r => r.id === id ? { ...r, status: 'completed' as const } : r));
      getDrafts().then(setDrafts).catch(() => {});
    } finally { setActioning(null); }
  }

  async function handleSendAll() {
    setSendingAll(true);
    setSendAllMsg(null);
    try {
      const result = await sendAllDraftsToMe();
      setSendAllMsg({ text: result.message, ok: result.ok });
    } catch (err) {
      setSendAllMsg({ text: (err as Error).message, ok: false });
    } finally {
      setSendingAll(false);
    }
  }

  async function handlePublish(draft: ContentDraft) {
    setPublishing(draft.id);
    setPublishMsg(null);
    try {
      const result = await publishDraftToTelegram(draft.id);
      setPublishMsg({ id: draft.id, text: result.message, ok: result.ok });
      if (result.ok) setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, status: 'published' as const } : d));
    } catch (err) {
      setPublishMsg({ id: draft.id, text: (err as Error).message, ok: false });
    } finally { setPublishing(null); }
  }

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <div className="text-gray-500 text-sm animate-pulse">Загрузка…</div>
      </main>
    );
  }

  if (runs.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-5xl mb-4">🤖</p>
          <p className="text-white font-semibold text-xl">Рой готов к работе</p>
          <p className="text-gray-500 text-sm mt-2 mb-6">Создайте первый прогон — агенты начнут работать</p>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))}
            className="bg-green-700 hover:bg-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            🚀 Создать прогон
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Результаты</h1>
            <p className="text-gray-500 text-sm mt-0.5">Статус работы роя</p>
          </div>
          <button onClick={load} className="text-xs text-gray-600 hover:text-gray-400 transition-colors border border-gray-800 px-3 py-1.5 rounded-lg">
            Обновить
          </button>
        </div>

        {/* ═══════════════ НЕ ГОТОВО ═══════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-red-900/40" />
            <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-2">
              🔴 Не готово
              {notReadyCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{notReadyCount}</span>
              )}
            </h2>
            <div className="h-px flex-1 bg-red-900/40" />
          </div>

          {notReadyCount === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
              <p className="text-gray-500 text-sm">Всё обработано — нет активных задач</p>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Ожидают одобрения плана */}
              {needsApproval.map(run => (
                <div key={run.id} className="bg-gray-900 border border-yellow-600/50 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-yellow-400 text-xs font-semibold bg-yellow-400/10 px-2 py-0.5 rounded-full shrink-0">
                      📋 Нужно одобрить план
                    </span>
                    <Link href={`/p/${slug}/runs/${run.id}`} className="text-xs text-gray-600 hover:text-gray-400 ml-auto shrink-0">
                      #{run.id}
                    </Link>
                  </div>
                  <p className="text-sm text-white font-medium mb-3">{run.goal}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprovePlan(run.id)}
                      disabled={actioning === run.id}
                      className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      {actioning === run.id ? 'Запускаю…' : '▶ Одобрить и запустить'}
                    </button>
                    <Link
                      href={`/p/${slug}/runs/${run.id}`}
                      className="text-gray-500 hover:text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      Посмотреть план
                    </Link>
                  </div>
                </div>
              ))}

              {/* Ожидают проверки результата */}
              {needsReview.map(run => (
                <div key={run.id} className="bg-gray-900 border border-blue-600/50 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-blue-400 text-xs font-semibold bg-blue-400/10 px-2 py-0.5 rounded-full shrink-0">
                      🔍 Нужно проверить результат
                    </span>
                    <Link href={`/p/${slug}/runs/${run.id}`} className="text-xs text-gray-600 hover:text-gray-400 ml-auto shrink-0">
                      #{run.id}
                    </Link>
                  </div>
                  <p className="text-sm text-white font-medium mb-2">{run.goal}</p>
                  {run.summary && (
                    <div className="bg-gray-800 rounded-lg p-3 mb-3">
                      <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap line-clamp-5">{run.summary}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApproveResult(run.id)}
                      disabled={actioning === run.id}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      {actioning === run.id ? 'Одобряю…' : '✓ Одобрить результат'}
                    </button>
                    <Link
                      href={`/p/${slug}/runs/${run.id}`}
                      className="text-gray-500 hover:text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      Детали
                    </Link>
                  </div>
                </div>
              ))}

              {/* В работе прямо сейчас */}
              {inProgress.map(run => (
                <Link
                  key={run.id}
                  href={`/p/${slug}/runs/${run.id}`}
                  className="flex items-center gap-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl p-3 transition-colors"
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="flex-1 text-sm text-gray-300 truncate">{run.goal}</span>
                  <span className="text-xs text-gray-600 shrink-0">{STATUS_LABEL[run.status]}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ═══════════════ ГОТОВО ═══════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-green-900/40" />
            <h2 className="text-xs font-semibold text-green-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-2">
              🟢 Готово
              {readyCount > 0 && (
                <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{readyCount}</span>
              )}
            </h2>
            <div className="h-px flex-1 bg-green-900/40" />
          </div>

          {/* Кнопка «Отправить всё себе» */}
          {pendingDrafts.length > 0 && (
            <div className="mb-4">
              <button
                onClick={handleSendAll}
                disabled={sendingAll}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                {sendingAll
                  ? '📤 Отправляю…'
                  : `📤 Отправить всё себе в Telegram (${pendingDrafts.length} материалов)`}
              </button>
              {sendAllMsg && (
                <p className={`mt-2 text-xs text-center px-3 py-1.5 rounded-lg ${sendAllMsg.ok ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>
                  {sendAllMsg.text}
                </p>
              )}
            </div>
          )}

          {readyCount === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
              <p className="text-gray-500 text-sm">Пока ничего не завершено</p>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Черновики к публикации */}
              {pendingDrafts.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2 px-1">📝 Готово к публикации ({pendingDrafts.length})</p>
                  <div className="space-y-2">
                    {pendingDrafts.map(draft => (
                      <div key={draft.id} className="bg-gray-900 border border-green-700/30 rounded-xl p-3">
                        <div className="flex items-start gap-3">
                          <span className="text-lg mt-0.5 shrink-0">{PLATFORM_EMOJI[draft.platform] ?? '📝'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200 font-medium truncate">{draft.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 capitalize">{draft.platform}</p>
                            <p className="text-xs text-gray-400 mt-1.5 line-clamp-3 leading-relaxed">{draft.content}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {draft.platform === 'telegram' && (
                              <button
                                onClick={() => handlePublish(draft)}
                                disabled={publishing === draft.id}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                              >
                                {publishing === draft.id ? '…' : '✈️ В канал'}
                              </button>
                            )}
                            <Link href={`/p/${slug}/tasks`} className="text-gray-600 hover:text-gray-400 text-xs text-center transition-colors">
                              Редактировать
                            </Link>
                          </div>
                        </div>
                        {publishMsg?.id === draft.id && (
                          <p className={`mt-2 text-xs px-2 py-1 rounded ${publishMsg.ok ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30'}`}>
                            {publishMsg.text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Завершённые прогоны */}
              {completed.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2 px-1">✅ Завершённые прогоны ({completed.length})</p>
                  <div className="space-y-2">
                    {completed.slice(0, 6).map(run => (
                      <div key={run.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200 font-medium">{run.goal}</p>
                          </div>
                          <Link
                            href={`/p/${slug}/runs/${run.id}`}
                            className="text-xs text-gray-600 hover:text-gray-400 shrink-0 transition-colors border border-gray-800 hover:border-gray-700 px-2 py-1 rounded"
                          >
                            #{run.id}
                          </Link>
                        </div>
                        {run.summary && (
                          <p className="text-xs text-gray-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">{run.summary}</p>
                        )}
                        <div className="flex items-center gap-3 mt-3 text-xs text-gray-600">
                          <span>{run.task_count} задач</span>
                          <span>·</span>
                          <span>${(run.total_cost_usd ?? 0).toFixed(4)}</span>
                          <span>·</span>
                          <span>{new Date(run.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                    ))}
                    {completed.length > 6 && (
                      <Link
                        href={`/p/${slug}/runs`}
                        className="block text-center text-xs text-gray-600 hover:text-gray-400 py-2 transition-colors"
                      >
                        Смотреть все прогоны →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
