'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Agent } from '@swarm/shared';
import { getAgents } from '@/lib/api';

const EMOJIS: Record<string, string> = {
  strategist:   '🧠',
  scriptwriter: '🎬',
  reelsmaker:   '📱',
  montager:     '✂️',
  designer:     '🎨',
  publisher:    '📅',
  programmer:   '💻',
  critic:       '🔍',
};

export default function ChatsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAgents()
      .then(setAgents)
      .catch(() => setError('Не удалось загрузить агентов. Бэкенд запущен?'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-400">Загрузка агентов…</div>;
  }

  if (error) {
    return <div className="p-8 text-red-400">⚠️ {error}</div>;
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-1">Чаты</h2>
      <p className="text-gray-400 mb-8 text-sm">Выберите агента чтобы начать разговор</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent) => (
          <Link
            key={agent.slug}
            href={`/chats/${agent.slug}`}
            className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-blue-500 hover:bg-gray-800/80 transition-all"
          >
            <div className="text-3xl mb-3">{EMOJIS[agent.slug] ?? '🤖'}</div>
            <h3 className="font-semibold mb-1 group-hover:text-blue-400 transition-colors">
              {agent.name}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">{agent.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
