import type { SQLiteDatabase } from "expo-sqlite";

import type { PersonalSnapshot } from "@/lib/db/types";

export async function getPersonalSnapshot(db: SQLiteDatabase): Promise<PersonalSnapshot> {
  const [
    memoryRow,
    pendingRow,
    openLoopRow,
    episodeRow,
    journalRow,
    reflectionRow,
    entityRow,
    relationRow,
    deviceRow,
    recentMemory,
  ] =
    await Promise.all([
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memory_atoms WHERE status = 'active'",
      ),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memory_candidates WHERE status = 'pending'",
      ),
      db.getFirstAsync<{ count: number }>(`
        SELECT COUNT(*) AS count
        FROM memory_atoms
        JOIN memory_candidates ON memory_candidates.candidate_id = memory_atoms.candidate_id
        WHERE memory_atoms.status = 'active' AND memory_candidates.kind = 'open_loop'
      `),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM episodes"),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM episodes WHERE source = 'journal'",
      ),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM reflections WHERE status = 'active'",
      ),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM entities"),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM relations"),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM devices"),
      db.getFirstAsync<any>(`
        SELECT memory_atoms.memory_id AS memory_id,
          memory_atoms.candidate_id AS candidate_id,
          memory_atoms.episode_id AS episode_id,
          memory_atoms.session_id AS session_id,
          memory_atoms.message_id AS message_id,
          memory_candidates.kind AS candidate_kind,
          memory_atoms.type AS type,
          memory_atoms.content AS content,
          memory_atoms.importance AS importance,
          memory_atoms.created_at AS created_at,
          memory_atoms.updated_at AS updated_at
        FROM memory_atoms
        LEFT JOIN memory_candidates ON memory_candidates.candidate_id = memory_atoms.candidate_id
        WHERE memory_atoms.status = 'active'
        ORDER BY memory_atoms.created_at DESC
        LIMIT 1
      `),
    ]);

  return {
    acceptedMemories: memoryRow?.count ?? 0,
    pendingCards: pendingRow?.count ?? 0,
    openLoopCount: openLoopRow?.count ?? 0,
    journalEntries: journalRow?.count ?? 0,
    episodeCount: episodeRow?.count ?? 0,
    reflectionCount: reflectionRow?.count ?? 0,
    entityCount: entityRow?.count ?? 0,
    relationCount: relationRow?.count ?? 0,
    deviceCount: deviceRow?.count ?? 0,
    recentMemory: recentMemory
      ? {
          id: recentMemory.memory_id,
          candidateId: recentMemory.candidate_id ?? undefined,
          episodeId: recentMemory.episode_id ?? undefined,
          sessionId: recentMemory.session_id ?? undefined,
          messageId: recentMemory.message_id ?? undefined,
          candidateKind: recentMemory.candidate_kind ?? undefined,
          type: recentMemory.type,
          content: recentMemory.content,
          importance: recentMemory.importance,
          createdAt: recentMemory.created_at,
          updatedAt: recentMemory.updated_at,
        }
      : undefined,
  };
}
