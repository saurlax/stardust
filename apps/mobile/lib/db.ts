import type { SQLiteDatabase } from "expo-sqlite";

import {
  createCandidatesFromToolCards,
  getMemoryCandidate,
  listMemoryCandidates,
  toToolCardsFromCandidates,
  updateCandidateStatus,
} from "@/lib/db/repositories/candidates";
import { loadLatestChatSession, saveChatSessionSnapshot } from "@/lib/db/repositories/chatSessions";
import {
  createDeviceEvent,
  listDeviceEvents,
  listDevices,
  updateDeviceStatus,
  upsertDevice,
} from "@/lib/db/repositories/devices";
import {
  createEpisode,
  listEpisodes,
  listJournalRecords,
  updateJournalContent,
} from "@/lib/db/repositories/episodes";
import {
  archiveReflection,
  dismissStoredMemory,
  listEntities,
  listReflections,
  listRelations,
  listStoredMemories,
  updateReflectionContent,
  updateStoredMemoryContent,
} from "@/lib/db/repositories/memoryRecords";
import { findRelevantKnowledge } from "@/lib/db/repositories/knowledge";
import { getPersonalSnapshot } from "@/lib/db/repositories/snapshot";
import { migrateDbIfNeeded } from "@/lib/db/schema";
import type {
  DeviceEventRecord,
  DeviceRecord,
  DeviceStatus,
  EntityRecord,
  Episode,
  EpisodeSource,
  JournalDay,
  JournalEntry,
  JournalRecord,
  PersonalSnapshot,
  ReflectionRecord,
  RelationRecord,
  RelevantKnowledge,
  StoredMemory,
} from "@/lib/db/types";

export const DATABASE_NAME = "stardust.db";
export { buildMemoryTree } from "@/lib/db/graph";
export {
  createCandidatesFromToolCards,
  getMemoryCandidate,
  listMemoryCandidates,
  toToolCardsFromCandidates,
  updateCandidateStatus,
};
export { createEpisode, listEpisodes, listJournalRecords, updateJournalContent };
export { createDeviceEvent, listDeviceEvents, listDevices, updateDeviceStatus, upsertDevice };
export { loadLatestChatSession, saveChatSessionSnapshot };
export { migrateDbIfNeeded };
export { findRelevantKnowledge };
export { getPersonalSnapshot };
export {
  archiveReflection,
  dismissStoredMemory,
  listEntities,
  listReflections,
  listRelations,
  listStoredMemories,
  updateReflectionContent,
  updateStoredMemoryContent,
};
export type {
  CandidateKind,
  CandidateStatus,
  DeviceEventRecord,
  DeviceRecord,
  DeviceStatus,
  EntityRecord,
  Episode,
  EpisodeSource,
  JournalDay,
  JournalEntry,
  JournalRecord,
  MemoryAtomType,
  MemoryCandidate,
  PersonalSnapshot,
  ReflectionRecord,
  RelationRecord,
  RelevantKnowledge,
  StoredMemory,
} from "@/lib/db/types";

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createSessionId = () => createId("session");

export async function listJournalDays(db: SQLiteDatabase): Promise<JournalDay[]> {
  const [episodes, memories] = await Promise.all([listEpisodes(db), listStoredMemories(db)]);
  const entries: JournalEntry[] = [
    ...episodes.map((episode) => ({
      id: episode.id,
      timestamp: episode.createdAt,
      note: episode.content,
      source: episode.source,
    })),
    ...memories.map((memory) => ({
      id: `timeline-${memory.id}`,
      timestamp: memory.createdAt,
      note: memory.content,
      source: "memory" as const,
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
