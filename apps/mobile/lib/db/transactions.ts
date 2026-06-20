import type { SQLiteDatabase } from "expo-sqlite";

let transactionQueue: Promise<void> = Promise.resolve();

export async function runInTransaction<T>(
  db: SQLiteDatabase,
  task: () => Promise<T>,
): Promise<T> {
  const run = async () => {
    await db.execAsync("BEGIN");
    try {
      const result = await task();
      await db.execAsync("COMMIT");
      return result;
    } catch (error) {
      await db.execAsync("ROLLBACK").catch(() => undefined);
      throw error;
    }
  };

  const next = transactionQueue.then(run, run);
  transactionQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
