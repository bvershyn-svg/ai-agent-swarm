// Фоновая очередь прогонов — обрабатывает по одному, восстанавливается при перезапуске
import { pool } from '../db';

type ExecutorFn = (runId: number) => Promise<void>;

class RunQueue {
  private busy = false;
  private pending: number[] = [];
  private executor: ExecutorFn | null = null;

  // Устанавливается в index.ts чтобы избежать циклического импорта
  setExecutor(fn: ExecutorFn): void {
    this.executor = fn;
  }

  // Добавить прогон в очередь на выполнение
  schedule(runId: number): void {
    this.pending.push(runId);
    this.drain();
  }

  // Взять следующий прогон из очереди и выполнить
  private drain(): void {
    if (this.busy || this.pending.length === 0 || !this.executor) return;

    const runId = this.pending.shift()!;
    this.busy = true;

    this.executor(runId)
      .catch((err: Error) => {
        console.error(`❌ Прогон ${runId} завершился с ошибкой:`, err.message);
        pool
          .query("UPDATE runs SET status='failed', updated_at=NOW() WHERE id=$1", [runId])
          .catch(() => {});
      })
      .finally(() => {
        this.busy = false;
        this.drain(); // Берём следующий
      });
  }

  // При перезапуске сервера — подхватить прерванные прогоны
  async recoverInterrupted(): Promise<void> {
    const { rows } = await pool.query<{ id: number }>(
      "SELECT id FROM runs WHERE status = 'running' ORDER BY id ASC",
    );
    if (rows.length > 0) {
      console.log(`🔄 Восстанавливаю ${rows.length} прерванных прогонов`);
      rows.forEach((r) => this.schedule(r.id));
    }
  }
}

export const queue = new RunQueue();
