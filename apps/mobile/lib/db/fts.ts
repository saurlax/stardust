import type { SQLiteDatabase } from "expo-sqlite";

import { isFtsAvailable } from "@/lib/db/schema";

export async function insertMemoryFts(
  db: SQLiteDatabase,
  memory: { id: string; type: string; content: string },
) {
  if (!(await isFtsAvailable(db))) return;
  await db.runAsync("DELETE FROM memory_atoms_fts WHERE memory_id = ?", memory.id);
  await db.runAsync(
    "INSERT INTO memory_atoms_fts (memory_id, type, content) VALUES (?, ?, ?)",
    memory.id,
    memory.type,
    memory.content,
  );
}

export async function insertReflectionFts(
  db: SQLiteDatabase,
  reflection: { id: string; title: string; content: string },
) {
  if (!(await isFtsAvailable(db))) return;
  await db.runAsync("DELETE FROM reflections_fts WHERE reflection_id = ?", reflection.id);
  await db.runAsync(
    "INSERT INTO reflections_fts (reflection_id, title, content) VALUES (?, ?, ?)",
    reflection.id,
    reflection.title,
    reflection.content,
  );
}
