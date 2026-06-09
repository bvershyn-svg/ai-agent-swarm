import { env } from './env';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { agentsRouter }   from './routes/agents';
import { runsRouter }     from './routes/runs';
import { eventsRouter }   from './routes/events';
import { profileRouter }  from './routes/profile';
import { contentRouter }  from './routes/content';
import { projectsRouter } from './routes/projects';
import { inboxRouter }    from './routes/inbox';
import { knowledgeRouter } from './routes/knowledge';
import { testsRouter }    from './routes/tests';
import { queue }          from './agents/queue';
import { executeRun }     from './agents/orchestrator';
import { authMiddleware, authStatus } from './middleware/auth';
import { projectMiddleware }          from './middleware/project';
import { startTelegramBot }           from './telegram';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Публичные эндпоинты (без проверки пароля)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});
app.get('/api/auth/status', authStatus);

// Все остальные /api/* — с проверкой пароля (если задан SWARM_PASSWORD)
app.use('/api', authMiddleware);

// Middleware: определяет проект из заголовка X-Project
app.use('/api', projectMiddleware);

app.use('/api/projects', projectsRouter);
app.use('/api/agents',   agentsRouter);
app.use('/api/runs',     runsRouter);
app.use('/api/events',   eventsRouter);
app.use('/api/profile',  profileRouter);
app.use('/api/content',  contentRouter);
app.use('/api/inbox',    inboxRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/tests',    testsRouter);

// Глобальный обработчик ошибок
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Ошибка:', err.message);
  res.status(500).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

app.listen(env.BACKEND_PORT, () => {
  console.log(`🚀 Бэкенд запущен → http://localhost:${env.BACKEND_PORT}`);
  if (env.SWARM_PASSWORD) console.log('🔐 Защита паролем: включена');

  queue.setExecutor(executeRun);
  queue.recoverInterrupted().catch((err: Error) => {
    console.error('Ошибка восстановления прогонов:', err.message);
  });

  startTelegramBot();
});
