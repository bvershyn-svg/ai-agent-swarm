'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { getKnowledgeSources, deleteKnowledgeSource, uploadKnowledge, patchKnowledgeSource } from '@/lib/api';
import type { KnowledgeSource } from '@swarm/shared';

const EXAMPLES = [
  'Бренд-бриф',
  'Описание аудитории',
  'Tone of Voice',
  'Продукты и услуги',
  'Конкурентный анализ',
];

export default function ContextPage() {
  const { slug } = useParams<{ slug: string }>();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [isPinned, setIsPinned] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    getKnowledgeSources()
      .then(setSources)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!name.trim() || !text.trim()) {
      setError('Заполните название и текст');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await uploadKnowledge(name.trim(), text.trim(), isPinned);
      setSuccess(`Материал «${name.trim()}» сохранён!`);
      setName('');
      setText('');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, srcName: string) {
    if (!confirm(`Удалить «${srcName}»?`)) return;
    try {
      await deleteKnowledgeSource(id);
      setSources(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleTogglePin(source: KnowledgeSource) {
    try {
      const updated = await patchKnowledgeSource(source.id, !source.is_pinned);
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_pinned: updated.is_pinned } : s));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (evt) => {
      setText(evt.target?.result as string ?? '');
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file, 'UTF-8');
  }

  const pinned = sources.filter(s => s.is_pinned);
  const searchable = sources.filter(s => !s.is_pinned);

  // slug используется для будущей навигации — переменная объявлена выше через useParams
  void slug;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Заголовок */}
        <div>
          <h1 className="text-xl font-bold text-white">Контекст проекта</h1>
          <p className="text-gray-500 text-sm mt-1">
            Материалы, которые агенты используют при каждой задаче
          </p>
        </div>

        {/* Объяснение */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4">
            <p className="text-blue-300 font-medium text-sm mb-1">Постоянный контекст</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Всегда виден всем агентам. Используйте для бренд-брифа, описания аудитории,
              тона общения и другой базовой информации о проекте.
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <p className="text-gray-300 font-medium text-sm mb-1">База знаний</p>
            <p className="text-gray-500 text-xs leading-relaxed">
              Агенты сами находят нужное через поиск. Используйте для объёмных материалов:
              исследований, конкурентного анализа, архива контента.
            </p>
          </div>
        </div>

        {/* Форма добавления */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Добавить материал</h2>

          <div className="space-y-3">
            {/* Название */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Название</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {EXAMPLES.map(ex => (
                  <button
                    key={ex}
                    onClick={() => setName(ex)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Например: Бренд-бриф, Tone of Voice, Описание продукта"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
              />
            </div>

            {/* Текст */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-500">Текст материала</label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  Загрузить .txt
                </button>
                <input ref={fileInputRef} type="file" accept=".txt,.md" onChange={handleFileLoad} className="hidden" />
              </div>
              <textarea
                rows={8}
                placeholder="Вставьте текст материала сюда. Можно скопировать из любого документа."
                value={text}
                onChange={e => setText(e.target.value)}
                className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600"
              />
              {text && <p className="text-xs text-gray-600 text-right mt-1">{text.length.toLocaleString('ru')} симв.</p>}
            </div>

            {/* Тип */}
            <div className="flex items-center gap-4">
              <label className="text-xs text-gray-500">Тип:</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPinned(true)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    isPinned
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Постоянный
                </button>
                <button
                  onClick={() => setIsPinned(false)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    !isPinned
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  База знаний
                </button>
              </div>
            </div>

            {error && <p className="text-red-400 text-xs bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-green-400 text-xs bg-green-900/20 rounded-lg px-3 py-2">{success}</p>}

            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !text.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? 'Сохраняю…' : '+ Сохранить материал'}
            </button>
          </div>
        </section>

        {/* Постоянный контекст */}
        {!loading && pinned.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              Постоянный контекст
              <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">{pinned.length}</span>
            </h2>
            <div className="space-y-2">
              {pinned.map(src => (
                <div key={src.id} className="bg-gray-900 border border-blue-700/20 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-blue-400 text-lg shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{src.name}</p>
                    <p className="text-xs text-gray-500">{src.chunk_count} фрагментов · {src.source_type}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTogglePin(src)}
                      className="text-xs text-gray-500 hover:text-yellow-400 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-yellow-600"
                      title="Переместить в базу знаний"
                    >
                      В базу знаний
                    </button>
                    <button
                      onClick={() => handleDelete(src.id, src.name)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                      title="Удалить"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* База знаний */}
        {!loading && searchable.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              База знаний
              <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">{searchable.length}</span>
            </h2>
            <div className="space-y-2">
              {searchable.map(src => (
                <div key={src.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-gray-500 text-lg shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{src.name}</p>
                    <p className="text-xs text-gray-600">{src.chunk_count} фрагментов · {src.source_type}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTogglePin(src)}
                      className="text-xs text-gray-500 hover:text-blue-400 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-blue-600"
                      title="Сделать постоянным контекстом"
                    >
                      Постоянный
                    </button>
                    <button
                      onClick={() => handleDelete(src.id, src.name)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                      title="Удалить"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Пусто */}
        {!loading && sources.length === 0 && (
          <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-2xl">
            <p className="text-3xl mb-3">📂</p>
            <p className="text-gray-300 font-medium">Контекст пуст</p>
            <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
              Добавьте бренд-бриф, описание аудитории и другие материалы — агенты будут работать с ними как с базой знаний
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
