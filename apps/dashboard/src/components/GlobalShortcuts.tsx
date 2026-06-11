'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createRun } from '@/lib/api';

interface NavItem {
  label: string;
  path: string;
  emoji: string;
  category: string;
}

export function GlobalShortcuts() {
  const pathname = usePathname();
  const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runGoal, setRunGoal] = useState('');
  const [runBudget, setRunBudget] = useState('');
  const [launching, setLaunching] = useState(false);
  const [runError, setRunError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const runGoalRef = useRef<HTMLTextAreaElement>(null);

  const projectSlug = pathname.match(/^\/p\/([^/]+)/)?.[1];

  const navItems: NavItem[] = [
    { label: 'Все проекты', path: '/projects', emoji: '🏠', category: 'Навигация' },
    ...(projectSlug ? [
      { label: 'Прогоны', path: `/p/${projectSlug}/runs`, emoji: '🚀', category: 'Проект' },
      { label: 'Инбокс идей', path: `/p/${projectSlug}/inbox`, emoji: '💡', category: 'Проект' },
      { label: 'На проверке', path: `/p/${projectSlug}/review`, emoji: '✅', category: 'Проект' },
      { label: 'Черновики', path: `/p/${projectSlug}/tasks`, emoji: '📝', category: 'Проект' },
      { label: 'Календарь', path: `/p/${projectSlug}/calendar`, emoji: '📅', category: 'Проект' },
      { label: 'База знаний', path: `/p/${projectSlug}/knowledge`, emoji: '📚', category: 'Проект' },
      { label: 'Тесты', path: `/p/${projectSlug}/tests`, emoji: '🧪', category: 'Проект' },
      { label: 'Профиль проекта', path: `/p/${projectSlug}/profile`, emoji: '⚙️', category: 'Проект' },
      { label: 'Стратег', path: `/p/${projectSlug}/chats/strategist`, emoji: '🧠', category: 'Агенты' },
      { label: 'Сценарист', path: `/p/${projectSlug}/chats/scriptwriter`, emoji: '✍️', category: 'Агенты' },
      { label: 'Продюсер', path: `/p/${projectSlug}/chats/producer`, emoji: '🎬', category: 'Агенты' },
      { label: 'Визуал', path: `/p/${projectSlug}/chats/visual`, emoji: '🖼', category: 'Агенты' },
      { label: 'Фактчекер', path: `/p/${projectSlug}/chats/factchecker`, emoji: '🔍', category: 'Агенты' },
      { label: 'Критик', path: `/p/${projectSlug}/chats/critic`, emoji: '🎯', category: 'Агенты' },
    ] : []),
  ];

  const filtered = searchQuery
    ? navItems.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : navItems;

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSelectedIndex(0);
  }, []);

  const closeNewRun = useCallback(() => {
    setShowNewRun(false);
    setRunGoal('');
    setRunBudget('');
    setRunError('');
    setLaunching(false);
  }, []);

  // Сброс выбора при изменении поиска
  useEffect(() => { setSelectedIndex(0); }, [searchQuery]);

  // Автофокус при открытии модальных окон
  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 30);
  }, [showSearch]);

  useEffect(() => {
    if (showNewRun) setTimeout(() => runGoalRef.current?.focus(), 30);
  }, [showNewRun]);

  // Глобальные горячие клавиши
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Не перехватываем стандартные клавиши редактирования текста
      const editing = new Set(['c', 'v', 'z', 'x', 'a', 'y']);
      if (e.ctrlKey && editing.has(e.key.toLowerCase())) return;

      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (showSearch) { closeSearch(); } else { closeNewRun(); setShowSearch(true); }
        return;
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (showNewRun) { closeNewRun(); } else { closeSearch(); setShowNewRun(true); }
        return;
      }
      if (e.key === 'Escape') {
        if (showSearch) { closeSearch(); return; }
        if (showNewRun) { closeNewRun(); return; }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSearch, showNewRun, closeSearch, closeNewRun]);

  // Клавиши навигации внутри поиска
  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      router.push(filtered[selectedIndex].path);
      closeSearch();
    }
  }

  async function handleLaunchRun() {
    if (!runGoal.trim() || launching || !projectSlug) return;
    setLaunching(true);
    setRunError('');
    try {
      const budget = runBudget ? parseFloat(runBudget) : undefined;
      const run = await createRun(runGoal.trim(), budget);
      closeNewRun();
      router.push(`/p/${projectSlug}/runs/${run.id}`);
    } catch (err) {
      setRunError((err as Error).message);
      setLaunching(false);
    }
  }

  function handleRunGoalKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleLaunchRun();
    }
  }

  if (!showSearch && !showNewRun) return null;

  return (
    <>
      {/* Затемнение фона */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={showSearch ? closeSearch : closeNewRun}
      />

      {/* Быстрый поиск (Ctrl+K) */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
              <span className="text-gray-400 text-sm">🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Поиск разделов и агентов…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none text-sm"
              />
              <kbd className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Ничего не найдено</p>
              ) : (
                filtered.map((item, i) => (
                  <button
                    key={item.path}
                    onClick={() => { router.push(item.path); closeSearch(); }}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      i === selectedIndex
                        ? 'bg-blue-600/30 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-base w-6 text-center shrink-0">{item.emoji}</span>
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-gray-600">{item.category}</span>
                  </button>
                ))
              )}
            </div>

            <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-600">
              <span><kbd className="bg-gray-800 px-1 rounded border border-gray-700">↑↓</kbd> навигация</span>
              <span><kbd className="bg-gray-800 px-1 rounded border border-gray-700">Enter</kbd> открыть</span>
              <span><kbd className="bg-gray-800 px-1 rounded border border-gray-700">Esc</kbd> закрыть</span>
            </div>
          </div>
        </div>
      )}

      {/* Новый прогон (Ctrl+N) */}
      {showNewRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h2 className="font-semibold text-sm">🚀 Новый прогон роя</h2>
              <button
                onClick={closeNewRun}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!projectSlug && (
                <p className="text-yellow-400 text-sm bg-yellow-400/10 rounded-lg px-3 py-2">
                  ⚠️ Откройте проект, чтобы запустить прогон
                </p>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Цель прогона</label>
                <textarea
                  ref={runGoalRef}
                  rows={4}
                  placeholder="Опишите задачу для роя агентов…"
                  value={runGoal}
                  onChange={(e) => setRunGoal(e.target.value)}
                  onKeyDown={handleRunGoalKeyDown}
                  disabled={!projectSlug}
                  className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600 disabled:opacity-50"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 shrink-0">Бюджет ($):</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="без лимита"
                  value={runBudget}
                  onChange={(e) => setRunBudget(e.target.value)}
                  disabled={!projectSlug}
                  className="w-32 bg-gray-800 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>

              {runError && (
                <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">⚠️ {runError}</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleLaunchRun}
                  disabled={launching || !runGoal.trim() || !projectSlug}
                  className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  {launching ? 'Запускаю…' : '▶ Запустить прогон'}
                </button>
                <button
                  onClick={closeNewRun}
                  className="text-gray-500 hover:text-gray-300 text-sm transition-colors px-2"
                >
                  Отмена
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center">Ctrl+Enter для запуска</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
