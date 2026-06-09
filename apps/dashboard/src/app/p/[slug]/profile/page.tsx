'use client';

import { useState, useEffect } from 'react';
import { getProfile, updateProfile } from '@/lib/api';
import type { ProjectProfile } from '@swarm/shared';

const FIELDS: { key: keyof ProjectProfile; label: string; placeholder: string; rows: number }[] = [
  { key: 'business', label: 'Бизнес / продукт', placeholder: 'Кратко опишите, чем занимается ваш бизнес…', rows: 2 },
  { key: 'audience', label: 'Целевая аудитория', placeholder: 'Кто ваши клиенты? Возраст, интересы, проблемы…', rows: 2 },
  { key: 'products', label: 'Продукты / услуги', placeholder: 'Что вы продаёте? Цены, преимущества…', rows: 3 },
  { key: 'tone', label: 'Тон и стиль', placeholder: 'Например: дружелюбный и экспертный, без формализма…', rows: 2 },
  { key: 'taboo', label: 'Запреты и ограничения', placeholder: 'Что нельзя писать? Конкуренты, темы, слова…', rows: 2 },
  { key: 'examples', label: 'Примеры удачных постов', placeholder: 'Вставьте примеры текстов, которые вам нравятся…', rows: 4 },
];

export default function ProjectProfilePage() {
  const [profile, setProfile] = useState<Partial<ProjectProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => setError('Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await updateProfile(profile);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: keyof ProjectProfile, value: string) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">🏢 Профиль бизнеса</h1>
        <p className="text-gray-500 text-sm mt-1">
          Эта информация будет встроена в каждый запрос к агентам — они будут знать о вашем бизнесе.
        </p>
      </div>

      <div className="space-y-5">
        {FIELDS.map(({ key, label, placeholder, rows }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
            <textarea
              rows={rows}
              placeholder={placeholder}
              value={(profile[key] as string | undefined) ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mt-4">⚠️ {error}</p>}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        {saved && <span className="text-green-400 text-sm">✓ Сохранено</span>}
      </div>

      {profile.updated_at && (
        <p className="text-gray-600 text-xs mt-4">
          Последнее обновление:{' '}
          {new Date(profile.updated_at as string).toLocaleString('ru-RU')}
        </p>
      )}
    </div>
  );
}
