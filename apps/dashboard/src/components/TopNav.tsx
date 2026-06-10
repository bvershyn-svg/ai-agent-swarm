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

  const currentProject = projects.find((p) => p.slug === currentSlug);

  // Открыть быстрый поиск через синтетическое событие
  function openSearch() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }

  // Открыть новый прогон через синтетическое событие
  function openNewRun() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
  }

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3 shrink-0">
      {/* Логотип */}
      <Link href="/projects" className="flex items-center gap-2 mr-1 hover:opacity-80 transition-opacity shrink-0">
        <span className="text-lg">🤖</span>
        <span className="font-bold text-sm text-white">Рой</span>
      </Link>

      {/* Активный проект + выбор */}
      <div className="relative">
        <button
          onClick={() => setShowProjects(!showProjects)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-200 hover:bg-gray-700 transition-colors"
        >
          {currentProject ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: currentProject.color }} />
              <span className="max-w-[140px] truncate">{currentProject.name}</span>
            </>
          ) : (
            <span className="text-gray-400">Выбрать проект</span>
          )}
          <span className="text-gray-500 text-xs ml-1">▼</span>
        </button>

        {showProjects && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 min-w-[220px] overflow-hidden">
            {projects.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-500">Нет проектов</p>
            )}
            {projects.map((p) => (
              <Link
                key={p.slug}
                href={`/p/${p.slug}/digest`}
                onClick={() => setShowProjects(false)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors ${
                  p.slug === currentSlug ? 'bg-gray-700/50 text-white' : 'text-gray-300'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate">{p.name}</span>
                {p.slug === currentSlug && <span className="text-xs text-gray-500">✓</span>}
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

      {/* Поиск */}
      <button
        onClick={openSearch}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
        title="Быстрый поиск (Ctrl+K)"
      >
        <span className="text-xs">🔍</span>
        <span className="text-xs text-gray-500 hidden md:block">Поиск разделов…</span>
        <kbd className="text-xs bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded border border-gray-600 hidden md:block">Ctrl+K</kbd>
      </button>

      <div className="flex-1" />

      {/* Навигация справа */}
      <nav className="flex items-center gap-2">
        {currentSlug && (
          <button
            onClick={openNewRun}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
            title="Новый прогон (Ctrl+N)"
          >
            <span>+</span>
            <span className="hidden sm:inline">Новый прогон</span>
            <kbd className="text-xs bg-green-800 text-green-300 px-1 py-0.5 rounded hidden md:block">Ctrl+N</kbd>
          </button>
        )}
        <Link
          href="/inbox"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            pathname.startsWith('/inbox')
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          title="Инбокс идей"
        >
          💡
          <span className="hidden sm:inline ml-1">Инбокс</span>
        </Link>
      </nav>

      {showProjects && (
        <div className="fixed inset-0 z-40" onClick={() => setShowProjects(false)} />
      )}
    </header>
  );
}
