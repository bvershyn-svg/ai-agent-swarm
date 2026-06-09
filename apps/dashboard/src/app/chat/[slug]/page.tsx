'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '@swarm/shared';
import { getChatHistory, sendMessage } from '@/lib/api';

const AGENT_NAMES: Record<string, string> = {
  strategist:      'Стратег',
  copywriter:      'Копирайтер',
  editor:          'Редактор',
  scriptwriter:    'Сценарист',
  analyst:         'Аналитик',
  trendwatcher:    'Трендвотчер',
  targetologist:   'Таргетолог',
  'design-director': 'Дизайн-директор',
};

export default function ChatPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatHistory(slug)
      .then(setMessages)
      .catch(() => setError('Не удалось загрузить историю чата'));
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setError('');
    try {
      const { history } = await sendMessage(slug, text);
      setMessages(history);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const agentName = AGENT_NAMES[slug] ?? slug;

  return (
    <div className="flex flex-col h-screen">
      {/* Шапка чата */}
      <div className="border-b border-gray-800 px-6 py-4 shrink-0">
        <h2 className="text-lg font-semibold">{agentName}</h2>
        <p className="text-gray-400 text-sm">Чат с ИИ-агентом</p>
      </div>

      {/* Список сообщений */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-gray-500 text-center mt-20">
            Напишите первое сообщение, чтобы начать диалог
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[72%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <span className="text-gray-400 text-sm">Печатает...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Сообщение об ошибке */}
      {error && (
        <div className="px-6 py-2 bg-red-900/40 text-red-300 text-sm shrink-0">
          ⚠️ {error}
        </div>
      )}

      {/* Поле ввода */}
      <div className="border-t border-gray-800 px-6 py-4 shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-500"
            rows={2}
            placeholder="Напишите сообщение… (Enter — отправить, Shift+Enter — новая строка)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-medium transition-colors text-sm shrink-0"
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
