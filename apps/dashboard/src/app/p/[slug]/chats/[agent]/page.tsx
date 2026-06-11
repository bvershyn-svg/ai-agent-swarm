'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@swarm/shared';
import { getChatHistory, sendMessage, createRun } from '@/lib/api';

const AGENT_META: Record<string, { name: string; emoji: string }> = {
  strategist:   { name: 'Стратег',     emoji: '🧠' },
  scriptwriter: { name: 'Сценарист',   emoji: '✍️' },
  producer:     { name: 'Продюсер',    emoji: '🎬' },
  visual:       { name: 'Визуал',      emoji: '🖼' },
  factchecker:  { name: 'Фактчекер',   emoji: '🔍' },
  critic:       { name: 'Критик',      emoji: '🎯' },
};

const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.txt,.docx';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

function AgentMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:      ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1:     ({ children }) => <p className="text-base font-bold mb-2 mt-1">{children}</p>,
        h2:     ({ children }) => <p className="text-sm font-bold mb-1 mt-1">{children}</p>,
        h3:     ({ children }) => <p className="text-sm font-semibold mb-1">{children}</p>,
        ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        hr:     () => <hr className="border-gray-600 my-2" />,
        code:   ({ children }) => (
          <code className="bg-black/30 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono leading-relaxed">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function ProjectChatPage() {
  const params = useParams<{ slug: string; agent: string }>();
  const router = useRouter();
  const { slug, agent } = params;
  const base = `/p/${slug}`;
  const meta = AGENT_META[agent] ?? { name: agent, emoji: '🤖' };
  const isStrategist = agent === 'strategist';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [launchGoal, setLaunchGoal] = useState('');
  const [launchBudget, setLaunchBudget] = useState('');
  const [showLaunch, setShowLaunch] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; mimeType: string; data: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Загрузка истории и автофокус
  useEffect(() => {
    getChatHistory(agent)
      .then(setMessages)
      .catch(() => setError('Не удалось загрузить историю чата'));
    textareaRef.current?.focus();
  }, [agent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Закрытие панели запуска по Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && showLaunch) {
        setShowLaunch(false);
        setLaunchGoal('');
        setLaunchBudget('');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLaunch]);

  const copyMessage = useCallback((content: string, id: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  async function handleSend() {
    const text = input.trim();
    if ((!text && !attachedFile) || loading) return;
    const fileToSend = attachedFile;
    setInput('');
    setAttachedFile(null);
    setLoading(true);
    setError('');
    try {
      const { history } = await sendMessage(agent, text, fileToSend ?? undefined);
      setMessages(history);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  async function handleLaunchRun() {
    if (!launchGoal.trim() || launching) return;
    setLaunching(true);
    try {
      const budget = launchBudget ? parseFloat(launchBudget) : undefined;
      const run = await createRun(launchGoal.trim(), budget);
      router.push(`${base}/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setLaunching(false);
    }
  }

  // Enter без Shift ИЛИ Ctrl+Enter → отправить
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE) {
      setError('Файл слишком большой. Максимум 10 МБ.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setAttachedFile({ name: file.name, mimeType: file.type, data: base64 });
      setError('');
    };
    reader.readAsDataURL(file);
  }

  const charCount = input.length;
  const charWarning = charCount > 3000;
  const charOver = charCount > 4000;

  return (
    <div className="flex flex-col h-screen">
      {/* Заголовок */}
      <div className="border-b border-gray-800 px-6 py-3 shrink-0 flex items-center gap-3">
        <span className="text-2xl">{meta.emoji}</span>
        <div className="flex-1">
          <h2 className="font-semibold leading-tight">{meta.name}</h2>
          <p className="text-gray-500 text-xs">Чат с агентом</p>
        </div>
        {isStrategist && (
          <button
            onClick={() => setShowLaunch(!showLaunch)}
            className="bg-green-700 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            🚀 Запустить прогон
          </button>
        )}
      </div>

      {/* Панель запуска прогона (только у стратега) */}
      {showLaunch && (
        <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">Новый прогон</h3>
            <span className="text-xs text-gray-600">Escape — закрыть</span>
          </div>
          <textarea
            rows={3}
            placeholder="Опишите цель прогона — что должен сделать рой агентов?"
            value={launchGoal}
            onChange={(e) => setLaunchGoal(e.target.value)}
            className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 text-sm placeholder-gray-600 mb-3"
          />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Бюджет ($):</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="без лимита"
                value={launchBudget}
                onChange={(e) => setLaunchBudget(e.target.value)}
                className="w-28 bg-gray-800 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button
              onClick={handleLaunchRun}
              disabled={launching || !launchGoal.trim()}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {launching ? 'Запускаю…' : '▶ Запустить'}
            </button>
            <button
              onClick={() => { setShowLaunch(false); setLaunchGoal(''); setLaunchBudget(''); }}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-gray-500 text-sm text-center mt-20">
            {meta.emoji} Напишите первое сообщение
            {isStrategist && (
              <p className="text-xs mt-2 text-gray-600">
                Или нажмите «Запустить прогон», чтобы поставить задачу всему рою
              </p>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <span className="text-lg mr-2 mt-1 shrink-0">{meta.emoji}</span>
            )}
            <div
              className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm relative group select-text ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <>
                  <AgentMessage content={msg.content} />
                  <button
                    onClick={() => copyMessage(msg.content, msg.id)}
                    className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                    title="Копировать ответ"
                  >
                    {copiedId === msg.id ? '✓ Скопировано' : '⎘ Копировать'}
                  </button>
                </>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start items-center gap-2">
            <span className="text-lg">{meta.emoji}</span>
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <span className="text-gray-400 text-sm">Печатает…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Ошибка */}
      {error && (
        <div className="px-6 py-2 bg-red-900/40 text-red-300 text-sm shrink-0">⚠️ {error}</div>
      )}

      {/* Прикреплённый файл */}
      {attachedFile && (
        <div className="px-6 py-2 shrink-0 flex items-center gap-2 bg-gray-900 border-t border-gray-800">
          <span className="text-gray-400 text-sm">📎</span>
          <span className="text-gray-300 text-sm flex-1 truncate">{attachedFile.name}</span>
          <button
            onClick={() => setAttachedFile(null)}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors"
            title="Удалить файл"
          >
            ×
          </button>
        </div>
      )}

      {/* Поле ввода */}
      <div className="border-t border-gray-800 px-6 py-4 shrink-0">
        <div className="flex gap-3 items-end">
          {/* Скрытый input для файлов */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILES}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Кнопка прикрепить файл */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors pb-3 shrink-0"
            title="Прикрепить файл (PDF, JPG, PNG, TXT, DOCX)"
          >
            📎
          </button>

          <div className="flex-1">
            <textarea
              ref={textareaRef}
              className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-500"
              rows={2}
              placeholder={`Напишите ${meta.name}у… (Enter — отправить, Shift+Enter — новая строка)`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            {/* Счётчик символов */}
            {charCount > 0 && (
              <div className={`text-right text-xs mt-1 ${charOver ? 'text-red-400' : charWarning ? 'text-yellow-500' : 'text-gray-600'}`}>
                {charCount.toLocaleString('ru')} симв.{charOver ? ' — слишком длинное' : ''}
              </div>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !attachedFile)}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
