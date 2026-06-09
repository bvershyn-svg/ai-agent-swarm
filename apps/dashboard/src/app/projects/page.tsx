'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getProjects, createProject, deleteProject, updateProject } from '@/lib/api';
import type { Project } from '@swarm/shared';

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: '', name: '', description: '', color: COLORS[0] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setError('Не удалось загрузить проекты'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!form.slug.trim() || !form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const p = await createProject(form);
      setProjects((prev) => [...prev, p]);
      setForm({ slug: '', name: '', description: '', color: COLORS[0] });
      setShowCreate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(slug: string) {
    setSaving(true);
    setError('');
    try {
      const p = await updateProject(slug, form);
      setProjects((prev) => prev.map((x) => (x.slug === slug ? p : x)));
      setEditId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm('Удалить проект? Все данные (прогоны, чаты, контент) будут удалены.')) return;
    try {
      await deleteProject(slug);
      setProjects((prev) => prev.filter((p) => p.slug !== slug));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <div className="p-6 text-gray-500 w-full">Загрузка…</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Проекты</h1>
          <p className="text-gray-500 text-sm mt-1">Каждый проект — отдельный канал или бизнес</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditId(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          + Новый проект
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}

      {/* Форма создания */}
      {showCreate && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
          <h3 className="font-semibold mb-4">Новый проект</h3>
          <ProjectForm form={form} onChange={setForm} />
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={saving || !form.slug.trim() || !form.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Создаю…' : 'Создать'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-gray-500 hover:text-gray-300 px-4 py-2 text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Список проектов */}
      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.slug} className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
            {editId === p.slug ? (
              <div className="p-5">
                <ProjectForm form={form} onChange={setForm} />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleEdit(p.slug)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {saving ? 'Сохраняю…' : 'Сохранить'}
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="text-gray-500 hover:text-gray-300 px-4 py-2 text-sm transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-5">
                <div className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/p/${p.slug}/runs`}
                      className="font-semibold hover:text-blue-400 transition-colors"
                    >
                      {p.name}
                    </Link>
                    <span className="text-xs text-gray-600 font-mono">{p.slug}</span>
                  </div>
                  {p.description && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/p/${p.slug}/runs`}
                    className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm transition-colors"
                  >
                    Открыть →
                  </Link>
                  <button
                    onClick={() => {
                      setForm({ slug: p.slug, name: p.name, description: p.description, color: p.color });
                      setEditId(p.slug);
                      setShowCreate(false);
                    }}
                    className="text-gray-500 hover:text-gray-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
                  >
                    ✏
                  </button>
                  {projects.length > 1 && (
                    <button
                      onClick={() => handleDelete(p.slug)}
                      className="text-red-500 hover:text-red-400 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {projects.length === 0 && (
          <p className="text-gray-500 text-center mt-10">Проектов пока нет. Создайте первый!</p>
        )}
      </div>
    </div>
  );
}

function ProjectForm({
  form,
  onChange,
}: {
  form: { slug: string; name: string; description: string; color: string };
  onChange: (f: { slug: string; name: string; description: string; color: string }) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Название</label>
          <input
            type="text"
            placeholder="Моя школа английского"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Slug (URL)</label>
          <input
            type="text"
            placeholder="my-school"
            value={form.slug}
            onChange={(e) => onChange({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            className="w-32 bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Описание (необязательно)</label>
        <input
          type="text"
          placeholder="Краткое описание проекта"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-2">Цвет</label>
        <div className="flex gap-2">
          {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map((c) => (
            <button
              key={c}
              onClick={() => onChange({ ...form, color: c })}
              className={`w-6 h-6 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-gray-800' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
