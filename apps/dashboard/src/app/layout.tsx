import type { Metadata } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { GlobalShortcuts } from '@/components/GlobalShortcuts';

export const metadata: Metadata = {
  title: 'Рой — ИИ-агенты для соцсетей',
  description: 'Система ИИ-агентов для автоматического ведения социальных сетей',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex flex-col bg-gray-950 text-gray-100 min-h-screen">
        <TopNav />
        <GlobalShortcuts />
        <div className="flex flex-1 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
