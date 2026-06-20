import type { SQLiteDatabase } from "expo-sqlite";

import { listEpisodes } from "@/lib/db/repositories/episodes";
import { listStoredMemories } from "@/lib/db/repositories/memoryRecords";
import type { JournalDay, JournalEntry } from "@/lib/db/types";

export async function listJournalDays(db: SQLiteDatabase): Promise<JournalDay[]> {
  const [episodes, memories] = await Promise.all([listEpisodes(db), listStoredMemories(db)]);
  const entries: JournalEntry[] = [
    ...episodes.map((episode) => ({
      id: episode.id,
      timestamp: episode.createdAt,
      title: episode.title,
      note: episode.content,
      source: episode.source,
    })),
    ...memories.map((memory) => ({
      id: `timeline-${memory.id}`,
      timestamp: memory.createdAt,
      title: memory.candidateKind === "open_loop" ? "open_loop" : memory.type,
      note: memory.content,
      source: "memory" as const,
      nodeId: `memory-${memory.id}`,
    })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const grouped = new Map<string, JournalDay>();
  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    const key = date.toISOString().slice(0, 10);
    const current = grouped.get(key);
    if (current) {
      current.entries.push(entry);
    } else {
      grouped.set(key, { date, entries: [entry] });
    }
  }
  return [...grouped.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}
