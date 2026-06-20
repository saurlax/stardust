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
import { isFtsAvailable, migrateDbIfNeeded } from "@/lib/db/schema";
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

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2);

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

const toFtsQuery = (query: string) =>
  query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(" OR ");

const rankByTokenMatches = (value: string, tokens: string[]) => {
  const normalized = value.toLowerCase();
  return -tokens.filter((token) => normalized.includes(token.toLowerCase())).length;
};

const mergeRelevantKnowledge = (items: RelevantKnowledge[], limit: number) => {
  const seen = new Set<string>();
  return items
    .sort((a, b) => a.rank - b.rank || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((item) => {
      const key = `${item.source}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

async function listRecentEpisodeKnowledge(
  db: SQLiteDatabase,
  limit: number,
): Promise<RelevantKnowledge[]> {
  const rows = await db.getAllAsync<{
    id: string;
    type: string;
    content: string;
    created_at: string;
  }>(
    `
      SELECT episode_id AS id, source AS type, content, created_at
      FROM episodes
      ORDER BY created_at DESC
      LIMIT ?
    `,
    limit,
  );

  return rows.map((item, index) => ({
    id: item.id,
    source: "episode" as const,
    type: item.type,
    content: item.content,
    createdAt: item.created_at,
    rank: 2 + index * 0.05,
  }));
}

export async function findRelevantKnowledge(
  db: SQLiteDatabase,
  query: string,
  limit = 8,
): Promise<RelevantKnowledge[]> {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];

  if (!(await isFtsAvailable(db))) {
    const tokens = tokenize(query);
    if (!tokens.length) return [];
    const like = tokens.map(() => "(content LIKE ? OR type LIKE ?)").join(" OR ");
    const episodeLike = tokens.map(() => "(content LIKE ? OR source LIKE ?)").join(" OR ");
    const params = tokens.flatMap((token) => [`%${token}%`, `%${token}%`]);
    const recentEpisodeLimit = Math.min(3, limit);
    const [memoryRows, episodeRows, reflectionRows, recentEpisodes] = await Promise.all([
      db.getAllAsync<any>(
        `SELECT memory_id AS id, type, content, created_at FROM memory_atoms WHERE status = 'active' AND ${like} LIMIT ?`,
        ...params,
        limit,
      ),
      db.getAllAsync<any>(
        `SELECT episode_id AS id, source AS type, content, created_at FROM episodes WHERE ${episodeLike} LIMIT ?`,
        ...params,
        limit,
      ),
      db.getAllAsync<any>(
        `SELECT reflection_id AS id, 'reflection' AS type, content, created_at FROM reflections WHERE status = 'active' AND content LIKE ? LIMIT ?`,
        `%${query}%`,
        limit,
      ),
      listRecentEpisodeKnowledge(db, recentEpisodeLimit),
    ]);
    return mergeRelevantKnowledge([
      ...memoryRows.map((item) => ({
        id: item.id,
        source: "memory" as const,
        type: item.type,
        content: item.content,
        createdAt: item.created_at,
        rank: rankByTokenMatches(`${item.type} ${item.content}`, tokens),
      })),
      ...episodeRows.map((item) => ({
        id: item.id,
        source: "episode" as const,
        type: item.type,
        content: item.content,
        createdAt: item.created_at,
        rank: rankByTokenMatches(`${item.type} ${item.content}`, tokens) + 0.2,
      })),
      ...reflectionRows.map((item) => ({
        id: item.id,
        source: "reflection" as const,
        type: item.type,
        content: item.content,
        createdAt: item.created_at,
        rank: rankByTokenMatches(item.content, tokens) - 0.2,
      })),
      ...recentEpisodes,
    ], limit);
  }

  const recentEpisodeLimit = Math.min(3, limit);
  const [memoryRows, episodeRows, reflectionRows, recentEpisodes] = await Promise.all([
    db.getAllAsync<any>(
      `
        SELECT memory_atoms.memory_id AS id, memory_atoms.type AS type,
          memory_atoms.content AS content, memory_atoms.created_at AS created_at,
          bm25(memory_atoms_fts) AS rank
        FROM memory_atoms_fts
        JOIN memory_atoms ON memory_atoms.memory_id = memory_atoms_fts.memory_id
        WHERE memory_atoms.status = 'active' AND memory_atoms_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      ftsQuery,
      limit,
    ),
    db.getAllAsync<any>(
      `
        SELECT episodes.episode_id AS id, episodes.source AS type,
          episodes.content AS content, episodes.created_at AS created_at,
          bm25(episodes_fts) AS rank
        FROM episodes_fts
        JOIN episodes ON episodes.episode_id = episodes_fts.episode_id
        WHERE episodes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      ftsQuery,
      limit,
    ),
    db.getAllAsync<any>(
      `
        SELECT reflections.reflection_id AS id, 'reflection' AS type,
          reflections.content AS content, reflections.created_at AS created_at,
          bm25(reflections_fts) AS rank
        FROM reflections_fts
        JOIN reflections ON reflections.reflection_id = reflections_fts.reflection_id
        WHERE reflections.status = 'active' AND reflections_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      ftsQuery,
      limit,
    ),
    listRecentEpisodeKnowledge(db, recentEpisodeLimit),
  ]);

  return mergeRelevantKnowledge([
    ...memoryRows.map((item) => ({
      id: item.id,
      source: "memory" as const,
      type: item.type,
      content: item.content,
      createdAt: item.created_at,
      rank: item.rank,
    })),
    ...episodeRows.map((item) => ({
      id: item.id,
      source: "episode" as const,
      type: item.type,
      content: item.content,
      createdAt: item.created_at,
      rank: item.rank + 0.2,
    })),
    ...reflectionRows.map((item) => ({
      id: item.id,
      source: "reflection" as const,
      type: item.type,
      content: item.content,
      createdAt: item.created_at,
      rank: item.rank - 0.2,
    })),
    ...recentEpisodes,
  ], limit);
}

export async function getPersonalSnapshot(db: SQLiteDatabase): Promise<PersonalSnapshot> {
  const [memoryRow, pendingRow, episodeRow, reflectionRow, deviceRow, recentMemory] =
    await Promise.all([
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memory_atoms WHERE status = 'active'",
      ),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memory_candidates WHERE status = 'pending'",
      ),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM episodes"),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM reflections WHERE status = 'active'",
      ),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM devices"),
      db.getFirstAsync<any>(`
        SELECT memory_id, candidate_id, episode_id, session_id, message_id, type,
          content, importance, created_at, updated_at
        FROM memory_atoms
        WHERE status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `),
    ]);

  return {
    acceptedMemories: memoryRow?.count ?? 0,
    pendingCards: pendingRow?.count ?? 0,
    journalEntries: episodeRow?.count ?? 0,
    episodeCount: episodeRow?.count ?? 0,
    reflectionCount: reflectionRow?.count ?? 0,
    deviceCount: deviceRow?.count ?? 0,
    recentMemory: recentMemory
      ? {
          id: recentMemory.memory_id,
          candidateId: recentMemory.candidate_id ?? undefined,
          episodeId: recentMemory.episode_id ?? undefined,
          sessionId: recentMemory.session_id ?? undefined,
          messageId: recentMemory.message_id ?? undefined,
          type: recentMemory.type,
          content: recentMemory.content,
          importance: recentMemory.importance,
          createdAt: recentMemory.created_at,
          updatedAt: recentMemory.updated_at,
        }
      : undefined,
  };
}
