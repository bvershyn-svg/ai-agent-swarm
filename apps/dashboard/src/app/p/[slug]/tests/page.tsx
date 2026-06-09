'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getTestScenarios, getTestRuns } from '@/lib/api';
import type { TestScenario, TestRun } from '@swarm/shared';

export default function ProjectTestsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getTestScenarios(), getTestRuns()])
      .then(([s, r]) => { setScenarios(s); setTestRuns(r); })
      .catch(() => setError('Не удалось загрузить тесты'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">🧪 Тесты</h1>
        <p className="text-gray-500 text-sm mt-1">
          Автоматическое тестирование агентов по сценариям
        </p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}

      <div className="bg-gray-800 border border-yellow-900/50 rounded-xl p-4 mb-6 text-sm text-yellow-300">
        <p className="font-medium mb-1">📌 Команды для тестирования</p>
        <div className="space-y-1 text-xs text-yellow-400 font-mono">
          <p><code className="bg-black/30 px-1.5 py-0.5 rounded">npm run tests:seed</code> — создать базовые сценарии</p>
          <p><code className="bg-black/30 px-1.5 py-0.5 rounded">npm run tests:batch -- --limit=30</code> — запустить пакет тестов</p>
        </div>
      </div>

      <div className="grid gap-6">
        {scenarios.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Сценарии ({scenarios.length})
            </h2>
            <div className="space-y-2">
              {scenarios.map((s) => (
                <div key={s.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.agent_slug} · {s.prompt.substring(0, 80)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {testRuns.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Последние запуски ({testRuns.length})
            </h2>
            <div className="space-y-2">
              {testRuns.slice(0, 20).map((r) => (
                <div key={r.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm">{r.scenario_id}</p>
                    <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString('ru-RU')}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    r.status === 'done' && r.verdict === 'pass' ? 'bg-green-900 text-green-300' :
                    r.status === 'failed' || r.verdict === 'fail' ? 'bg-red-900 text-red-300' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {r.verdict ?? r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {scenarios.length === 0 && testRuns.length === 0 && (
          <div className="text-center text-gray-500 mt-10">
            <p className="text-4xl mb-3">🧪</p>
            <p>Тестов пока нет.</p>
            <p className="text-sm mt-1">Запустите <code className="bg-gray-800 px-2 py-0.5 rounded text-gray-400">npm run tests:seed</code> для создания сценариев.</p>
          </div>
        )}
      </div>
    </div>
  );
}
