import { redirect } from 'next/navigation';

// Главная → список проектов
export default function HomePage() {
  redirect('/projects');
}
