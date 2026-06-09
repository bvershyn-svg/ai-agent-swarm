'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getEventCount } from '@/lib/api';

const AGENTS = [
  { slug: 'strategist',   name: 'Стратег',     emoji: '🧠' },
  { slug: 'scriptwriter', name: 'Сценарист',    emoji: '🎬' },
  { slug: 'reelsmaker',   name: 'Рилсмейкер',  emoji: '📱' },
  { slug: 'montager',     name: 'Монтажёр',     emoji: '✂️' },
  { slug: 'designer',     name: 'Дизайнер',     emoji: '🎨' },
  { slug: 'publisher',    name: 'Публикатор',   emoji: '📅' },
  { slug: 'programmer',   name: 'Программист',  emoji: '💻' },
  { slug: 'critic',       name: 'Критик',       emoji: '🔍' },
];

const MAIN_NAV = [
  { href: 'runs',     label: 'Прогоны',       icon: '🚀' },
  { href: 'inbox',    label: 'Инбокс идей',   icon: '💡' },
  { href: 'review',   label: 'На проверке',   icon: '📋' },
  { href: 'tasks',    label: 'Черновики',     icon: '📝' },
  { href: 'calendar', label: 'Календарь',     icon: '📅' },
  { href: 'knowledge',label: 'Знания',        icon: '📚' },
  { href: 'tests',    label: 'Тесты',         icon: '🧪' },
  { href: 'profile',  label: 'Профиль',       icon: '🏢' },
];

export function ProjectSidebar({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    const fetchCount = () => {
      getEventCount().then((r) => setEventCount(r.count)).catch(() => {});
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
    <aside className="w-56 bg-gray-900 flex flex-col h-full shrink-0 border-r border-gray-800">
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">

        {/* Основные разделы */}
        <div className="pb-1 px-3 pt-2">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Проект</p>
        </div>

        {MAIN_NAV.map(({ href, label, icon }) => {
          const fullHref = `${base}/${href}`;
          const isRuns = href === 'runs';
          return (
            <Link key={href} href={fullHref} className={navClass(fullHref)}>
              {icon} <span className="flex-1">{label}</span>
              {isRuns && eventCount > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {eventCount > 99 ? '99+' : eventCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Чаты с агентами */}
        <div className="pt-4 pb-1 px-3">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Чаты</p>
        </div>

        {AGENTS.map((agent) => {
          const href = `${base}/chats/${agent.slug}`;
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
        Рой v0.3.0
      </div>
    </aside>
  );
}
