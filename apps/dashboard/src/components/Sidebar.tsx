'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getEventCount } from '@/lib/api';

const AGENTS = [
  { slug: 'strategist',   name: 'Стратег',     emoji: '🧠' },
  { slug: 'scriptwriter', name: 'Сценарист',   emoji: '✍️' },
  { slug: 'producer',     name: 'Продюсер',    emoji: '🎬' },
  { slug: 'visual',       name: 'Визуал',      emoji: '🖼' },
  { slug: 'factchecker',  name: 'Фактчекер',   emoji: '🔍' },
  { slug: 'critic',       name: 'Критик',      emoji: '🎯' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [eventCount, setEventCount] = useState(0);

  // Проверяем непрочитанные уведомления каждые 30 секунд
  useEffect(() => {
    const fetchCount = () => {
      getEventCount()
        .then((r) => setEventCount(r.count))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  function navClass(href: string) {
    return `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? 'bg-gray-700 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;
  }

  return (
    <aside className="w-60 bg-gray-900 text-white flex flex-col h-screen shrink-0">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">🤖 Рой</h1>
        <p className="text-gray-500 text-xs mt-0.5">ИИ-агенты для соцсетей</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {/* Главная */}
        <Link href="/" className={navClass('/')} onClick={() => pathname !== '/' && undefined}>
          🏠 <span>Главная</span>
        </Link>

        {/* Раздел: Рой */}
        <div className="pt-4 pb-1 px-3">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Рой</p>
        </div>

        <Link href="/runs" className={navClass('/runs')}>
          🚀 <span className="flex-1">Прогоны</span>
          {eventCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
              {eventCount > 99 ? '99+' : eventCount}
            </span>
          )}
        </Link>

        <Link href="/review" className={navClass('/review')}>
          📋 <span>На проверке</span>
        </Link>

        {/* Раздел: Контент */}
        <div className="pt-4 pb-1 px-3">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Контент</p>
        </div>

        <Link href="/tasks" className={navClass('/tasks')}>
          📝 <span>Черновики</span>
        </Link>

        <Link href="/calendar" className={navClass('/calendar')}>
          📅 <span>Календарь</span>
        </Link>

        <Link href="/profile" className={navClass('/profile')}>
          🏢 <span>Профиль бизнеса</span>
        </Link>

        {/* Раздел: Чаты */}
        <div className="pt-4 pb-1 px-3">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Чаты</p>
        </div>

        <Link href="/chats" className={navClass('/chats')}>
          💬 <span>Все агенты</span>
        </Link>

        {/* Список агентов */}
        <div className="pt-2 pb-1 px-3">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Агенты</p>
        </div>

        {AGENTS.map((agent) => {
          const href = `/chats/${agent.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={agent.slug}
              href={href}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <span className="text-base">{agent.emoji}</span>
              <span>{agent.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-800 text-xs text-gray-600">
        Рой v0.2.0
      </div>
    </aside>
  );
}
