'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getEventCount } from '@/lib/api';

const AGENTS = [
  { slug: 'strategist',   name: 'Стратег',    emoji: '🧠', hint: 'Угол подачи и план' },
  { slug: 'scriptwriter', name: 'Сценарист',  emoji: '✍️', hint: 'Сценарий для Reels/Shorts' },
  { slug: 'producer',     name: 'Продюсер',   emoji: '🎬', hint: 'Структура и темп' },
  { slug: 'visual',       name: 'Визуал',     emoji: '🖼', hint: 'Покадровый план' },
  { slug: 'factchecker',  name: 'Фактчекер',  emoji: '🔍', hint: 'Проверка источников' },
  { slug: 'critic',       name: 'Критик',     emoji: '🎯', hint: 'Финальная оценка' },
];

const MAIN_NAV = [
  { href: 'digest',    label: 'Результаты',    icon: '✅', hint: 'Что сделано и что делать' },
  { href: 'news',      label: 'Новости',       icon: '🗞', hint: 'Новостная фабрика' },
  { href: 'runs',      label: 'Прогоны',       icon: '🚀', hint: 'Все задачи роя' },
  { href: 'inbox',     label: 'Инбокс идей',   icon: '💡', hint: 'Ваши идеи для роя' },
  { href: 'review',    label: 'На проверке',   icon: '📋', hint: 'Ожидают вашего ответа' },
  { href: 'tasks',     label: 'Черновики',     icon: '📝', hint: 'Готовый контент' },
  { href: 'calendar',  label: 'Календарь',     icon: '📅', hint: 'Контент-план' },
  { href: 'knowledge', label: 'Знания',        icon: '📚', hint: 'База знаний проекта' },
  { href: 'context',   label: 'Контекст',      icon: '📂', hint: 'Материалы для агентов' },
  { href: 'tests',     label: 'Тесты',         icon: '🧪', hint: 'Тестирование агентов' },
  { href: 'profile',   label: 'Профиль',       icon: '🏢', hint: 'О проекте и аудитории' },
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
    return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors group ${
      isActive(href)
        ? 'bg-gray-700 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;
  }

  return (
    <aside className="w-56 bg-gray-900 flex flex-col h-full shrink-0 border-r border-gray-800">
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">

        {/* Основные разделы */}
        <div className="pb-1 px-2 pt-2">
          <p className="text-gray-600 text-xs uppercase tracking-wider font-medium">Проект</p>
        </div>

        {MAIN_NAV.map(({ href, label, icon, hint }) => {
          const fullHref = `${base}/${href}`;
          const isRuns = href === 'runs';
          const isDigest = href === 'digest';
          const active = isActive(fullHref);
          return (
            <Link key={href} href={fullHref} className={navClass(fullHref)} title={hint}>
              <span className="text-base w-5 text-center shrink-0">{icon}</span>
              <span className="flex-1 truncate">{label}</span>
              {isRuns && eventCount > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {eventCount > 99 ? '99+' : eventCount}
                </span>
              )}
              {isDigest && !active && (
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Ваш главный раздел" />
              )}
            </Link>
          );
        })}

        {/* Чаты с агентами */}
        <div className="pt-4 pb-1 px-2">
          <p className="text-gray-600 text-xs uppercase tracking-wider font-medium">Чаты с агентами</p>
        </div>

        {AGENTS.map((agent) => {
          const href = `${base}/chats/${agent.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={agent.slug}
              href={href}
              title={agent.hint}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <span className="text-base shrink-0">{agent.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate">{agent.name}</p>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Подсказки горячих клавиш */}
      <div className="p-3 border-t border-gray-800 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Поиск</span>
          <kbd className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-500">Ctrl+K</kbd>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Новый прогон</span>
          <kbd className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-500">Ctrl+N</kbd>
        </div>
        <p className="text-gray-700 text-xs pt-0.5">Рой v0.3.0</p>
      </div>
    </aside>
  );
}
