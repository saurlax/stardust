import type { SQLiteDatabase } from "expo-sqlite";

import { listEpisodes } from "@/lib/db/repositories/episodes";
import {
  listReflections,
  listRelations,
  listStoredMemories,
} from "@/lib/db/repositories/memoryRecords";
import type { JournalDay, JournalEntry } from "@/lib/db/types";

export async function listJournalDays(db: SQLiteDatabase): Promise<JournalDay[]> {
  const [episodes, memories, reflections, relations] = await Promise.all([
    listEpisodes(db),
    listStoredMemories(db),
    listReflections(db),
    listRelations(db),
  ]);
  const entries: JournalEntry[] = [
    ...episodes.map((episode) => ({
      id: episode.id,
      timestamp: episode.createdAt,
      title: episode.title,
      note: episode.content,
      source: episode.source,
      mediaUri: episode.mediaUri,
      metadata: episode.metadata,
    })),
    ...memories.map((memory) => ({
      id: `timeline-${memory.id}`,
      timestamp: memory.createdAt,
      title: memory.candidateKind === "open_loop" ? "open_loop" : memory.type,
      note: memory.content,
      source: "memory" as const,
      metadata: {
        importance: memory.importance,
        rationale: memory.rationale,
        sourceKind: memory.sourceKind,
      },
      nodeId: `memory-${memory.id}`,
    })),
    ...reflections.map((reflection) => ({
      id: `timeline-${reflection.id}`,
      timestamp: reflection.createdAt,
      title: reflection.title,
      note: reflection.content,
      source: "reflection" as const,
      metadata: {
        rationale: reflection.rationale,
        sourceKind: reflection.sourceKind,
      },
      nodeId: `reflection-${reflection.id}`,
    })),
    ...relations.map((relation) => ({
      id: `timeline-${relation.id}`,
      timestamp: relation.createdAt,
      title: relation.type,
      note: `${relation.sourceEntityName ?? relation.sourceEntityId} -> ${
        relation.targetEntityName ?? relation.targetEntityId
      }`,
      source: "relation" as const,
      metadata: {
        rationale: relation.rationale,
        sourceKind: relation.sourceKind,
        weight: relation.weight,
      },
      nodeId: `relation-${relation.id}`,
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
