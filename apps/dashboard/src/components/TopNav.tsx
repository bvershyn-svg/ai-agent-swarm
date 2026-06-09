'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getProjects } from '@/lib/api';
import type { Project } from '@swarm/shared';

export function TopNav() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  const currentSlug = pathname.match(/^\/p\/([^/]+)/)?.[1];

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  function navClass(href: string) {
    const active = pathname === href || pathname.startsWith(href + '/');
    return `px-3 py-1.5 rounded-lg text-sm transition-colors ${
      active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;
  }

  const currentProject = projects.find((p) => p.slug === currentSlug);

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
      {/* Логотип */}
      <Link href="/projects" className="flex items-center gap-2 mr-2 hover:opacity-80 transition-opacity">
        <span className="text-lg">🤖</span>
        <span className="font-bold text-sm text-white">Рой</span>
      </Link>

      {/* Активный проект + выбор проекта */}
      <div className="relative">
        <button
          onClick={() => setShowProjects(!showProjects)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-200 hover:bg-gray-700 transition-colors"
        >
          {currentProject ? (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: currentProject.color }}
              />
              <span className="max-w-[160px] truncate">{currentProject.name}</span>
            </>
          ) : (
            <span>Проекты</span>
          )}
          <span className="text-gray-500 text-xs ml-1">▼</span>
        </button>

        {showProjects && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden">
            {projects.map((p) => (
              <Link
                key={p.slug}
                href={`/p/${p.slug}/runs`}
                onClick={() => setShowProjects(false)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors ${
                  p.slug === currentSlug ? 'bg-gray-700/50 text-white' : 'text-gray-300'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate">{p.name}</span>
              </Link>
            ))}
            <div className="border-t border-gray-700">
              <Link
                href="/projects"
                onClick={() => setShowProjects(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
              >
                + Управление проектами
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Навигация */}
      <nav className="flex items-center gap-1">
        <Link href="/inbox" className={navClass('/inbox')}>
          💡 Инбокс идей
        </Link>
      </nav>

      {/* Клик вне выпадушки — закрыть */}
      {showProjects && (
        <div className="fixed inset-0 z-40" onClick={() => setShowProjects(false)} />
      )}
    </header>
  );
}
