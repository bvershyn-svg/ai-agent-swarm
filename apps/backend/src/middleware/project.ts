// Middleware: читает X-Project заголовок, добавляет req.projectId
import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      projectId: number | null;
      projectSlug: string | null;
    }
  }
}

export async function projectMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const slug = (req.headers['x-project'] as string | undefined)
    ?? (req.query.project as string | undefined);

  if (!slug) {
    req.projectId   = null;
    req.projectSlug = null;
    return next();
  }

  try {
    const { rows } = await pool.query<{ id: number }>(
      'SELECT id FROM projects WHERE slug = $1',
      [slug],
    );
    req.projectId   = rows[0]?.id ?? null;
    req.projectSlug = slug;
  } catch {
    req.projectId   = null;
    req.projectSlug = null;
  }
  next();
}
