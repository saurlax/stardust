import type { SQLiteDatabase } from "expo-sqlite";

import type { MessageToolCard, ToolCardType } from "@/lib/chat/types";
import { loadLatestChatSession, saveChatSessionSnapshot } from "@/lib/db/repositories/chatSessions";
import {
  createEpisode,
  listEpisodes,
  listJournalRecords,
  updateJournalContent,
} from "@/lib/db/repositories/episodes";
import { isFtsAvailable, migrateDbIfNeeded } from "@/lib/db/schema";
import { parseJson, parseToolCards, safeJson, serializeToolCards } from "@/lib/db/serialization";
import { runInTransaction } from "@/lib/db/transactions";
import type {
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
  MemoryCandidate,
  PersonalSnapshot,
  ReflectionRecord,
  RelationRecord,
  RelevantKnowledge,
  StoredMemory,
} from "@/lib/db/types";

export const DATABASE_NAME = "stardust.db";
export { buildMemoryTree } from "@/lib/db/graph";
export { createEpisode, listEpisodes, listJournalRecords, updateJournalContent };
export { loadLatestChatSession, saveChatSessionSnapshot };
export { migrateDbIfNeeded };
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
const SELF_ENTITY_ID = "entity-self";
const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const createEntityId = (type: string, name: string, fallbackId: string) =>
  `entity-${type}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-+|-+$/g, "") || fallbackId}`;

export const createSessionId = () => createId("session");

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2);

async function syncCandidateToolCardSnapshot(
  db: SQLiteDatabase,
  candidate: MemoryCandidate,
  status: CandidateStatus,
  content: string,
  updatedAt: string,
) {
  if (!candidate.sessionId || !candidate.messageId) return;

  const row = await db.getFirstAsync<{ tool_cards_json: string | null }>(
    `
      SELECT tool_cards_json
      FROM chat_messages
      WHERE session_id = ? AND message_id = ?
      LIMIT 1
    `,
    candidate.sessionId,
    candidate.messageId,
  );
  const cards = parseToolCards(row?.tool_cards_json);
  if (!cards?.length) return;

  const nextCards = cards.map((card) =>
    card.id === candidate.id
      ? {
          ...card,
          status,
          payload: {
            ...card.payload,
            content,
          },
        }
      : card,
  );

  await db.runAsync(
    `
      UPDATE chat_messages
      SET tool_cards_json = ?, updated_at = ?
      WHERE session_id = ? AND message_id = ?
    `,
    serializeToolCards(nextCards),
    updatedAt,
    candidate.sessionId,
    candidate.messageId,
  );
}

const cardKind = (type: ToolCardType): CandidateKind => {
  if (type === "append_journal") return "journal";
  if (type === "suggest_reflection") return "reflection";
  if (type === "link_entity") return "entity";
  if (type === "mark_open_loop") return "open_loop";
  return "memory";
};

const candidateToToolCard = (candidate: MemoryCandidate): MessageToolCard => ({
  id: candidate.id,
  type:
    candidate.kind === "journal"
      ? "append_journal"
      : candidate.kind === "reflection"
        ? "suggest_reflection"
        : candidate.kind === "entity"
          ? "link_entity"
          : candidate.kind === "open_loop"
            ? "mark_open_loop"
            : "save_memory",
  title: candidate.title,
  status: candidate.status,
  createdAt: candidate.createdAt,
  payload: {
    content: candidate.content,
    memoryType: candidate.type,
    relationTarget:
      typeof candidate.metadata?.relationTarget === "string"
        ? candidate.metadata.relationTarget
        : undefined,
    relationTargetType:
      typeof candidate.metadata?.relationTargetType === "string"
        ? candidate.metadata.relationTargetType
        : undefined,
    relationType:
      typeof candidate.metadata?.relationType === "string"
        ? candidate.metadata.relationType
        : undefined,
  },
});

export async function createCandidatesFromToolCards(
  db: SQLiteDatabase,
  {
    sessionId,
    messageId,
    episodeId,
    cards,
  }: {
    sessionId: string;
    messageId: string;
    episodeId?: string;
    cards?: MessageToolCard[];
  },
) {
  if (!cards?.length) return;
  const createdAt = nowIso();

  await runInTransaction(db, async () => {
    for (const card of cards) {
      const content = card.payload.content.trim();
      if (!content) continue;
      await db.runAsync(
        `
          INSERT OR IGNORE INTO memory_candidates (
            candidate_id, session_id, message_id, episode_id, kind, type, title,
            content, status, metadata_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        card.id,
        sessionId,
        messageId,
        episodeId ?? null,
        cardKind(card.type),
        card.payload.memoryType ?? "memory",
        card.title,
        content,
        card.status ?? "pending",
        safeJson({ toolType: card.type, ...card.payload }),
        card.createdAt ?? createdAt,
        createdAt,
      );
    }
  });
}

export async function updateCandidateStatus(
  db: SQLiteDatabase,
  candidateId: string,
  status: CandidateStatus,
  nextContent?: string,
) {
  const candidate = await getMemoryCandidate(db, candidateId);
  if (!candidate) return;
  const content = nextContent?.trim() || candidate.content;
  const updatedAt = nowIso();

  await runInTransaction(db, async () => {
    await db.runAsync(
      `
        UPDATE memory_candidates
        SET status = ?, content = ?, updated_at = ?
        WHERE candidate_id = ?
      `,
      status,
      content,
      updatedAt,
      candidateId,
    );
    await syncCandidateToolCardSnapshot(db, candidate, status, content, updatedAt);

    if (status !== "accepted") return;

    if (candidate.kind === "memory" || candidate.kind === "open_loop") {
      const type = candidate.kind === "open_loop" ? "concern" : candidate.type || "memory";
      await db.runAsync(
        `
          INSERT OR REPLACE INTO memory_atoms (
            memory_id, candidate_id, episode_id, session_id, message_id, type,
            content, importance, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `,
        `memory-${candidateId}`,
        candidateId,
        candidate.episodeId ?? null,
        candidate.sessionId ?? null,
        candidate.messageId ?? null,
        type,
        content,
        candidate.kind === "open_loop" ? 4 : 3,
        updatedAt,
        updatedAt,
      );
      await insertMemoryFts(db, {
        id: `memory-${candidateId}`,
        type,
        content,
      });
    }

    if (candidate.kind === "journal") {
      await createEpisode(db, {
        id: `episode-${candidateId}`,
        source: "journal",
        title: candidate.title,
        content,
        metadata: { candidateId },
        createdAt: updatedAt,
      });
    }

    if (candidate.kind === "reflection") {
      await db.runAsync(
        `
          INSERT OR REPLACE INTO reflections (
            reflection_id, candidate_id, title, content, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, 'active', ?, ?)
        `,
        `reflection-${candidateId}`,
        candidateId,
        candidate.title,
        content,
        updatedAt,
        updatedAt,
      );
      await insertReflectionFts(db, {
        id: `reflection-${candidateId}`,
        title: candidate.title,
        content,
      });
    }

    if (candidate.kind === "entity") {
      const entityName = candidate.title.trim() || content;
      const entityType = candidate.type || "topic";
      const entityId = createEntityId(entityType, entityName, candidateId);
      const relationId = `relation-self-${entityId}`;
      const relationTarget =
        typeof candidate.metadata?.relationTarget === "string"
          ? candidate.metadata.relationTarget.trim()
          : "";
      const relationTargetType =
        typeof candidate.metadata?.relationTargetType === "string"
          ? candidate.metadata.relationTargetType.trim() || "topic"
          : "topic";
      const relationType =
        typeof candidate.metadata?.relationType === "string"
          ? candidate.metadata.relationType.trim() || "related"
          : "related";
      await db.runAsync(
        `
          INSERT INTO entities (entity_id, name, type, created_at, updated_at)
          VALUES (?, ?, 'person', ?, ?)
          ON CONFLICT(name, type) DO UPDATE SET updated_at = excluded.updated_at
        `,
        SELF_ENTITY_ID,
        "you",
        updatedAt,
        updatedAt,
      );
      await db.runAsync(
        `
          INSERT INTO entities (entity_id, name, type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(name, type) DO UPDATE SET updated_at = excluded.updated_at
        `,
        entityId,
        entityName,
        entityType,
        updatedAt,
        updatedAt,
      );
      await db.runAsync(
        `
          INSERT INTO relations (
            relation_id, source_entity_id, target_entity_id, type, weight, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(relation_id) DO UPDATE SET
            weight = relations.weight + 1,
            updated_at = excluded.updated_at
        `,
        relationId,
        SELF_ENTITY_ID,
        entityId,
        "noticed",
        updatedAt,
        updatedAt,
      );

      if (relationTarget && relationTarget.toLowerCase() !== entityName.toLowerCase()) {
        const targetEntityId = createEntityId(relationTargetType, relationTarget, candidateId);
        await db.runAsync(
          `
            INSERT INTO entities (entity_id, name, type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(name, type) DO UPDATE SET updated_at = excluded.updated_at
          `,
          targetEntityId,
          relationTarget,
          relationTargetType,
          updatedAt,
          updatedAt,
        );
        await db.runAsync(
          `
            INSERT INTO relations (
              relation_id, source_entity_id, target_entity_id, type, weight, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(relation_id) DO UPDATE SET
              weight = relations.weight + 1,
              updated_at = excluded.updated_at
          `,
          `relation-${entityId}-${targetEntityId}-${relationType.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-") || "related"}`,
          entityId,
          targetEntityId,
          relationType,
          updatedAt,
          updatedAt,
        );
      }
    }
  });
}

async function insertMemoryFts(
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

async function insertReflectionFts(
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

export async function getMemoryCandidate(
  db: SQLiteDatabase,
  candidateId: string,
): Promise<MemoryCandidate | null> {
  const row = await db.getFirstAsync<{
    candidate_id: string;
    session_id: string | null;
    message_id: string | null;
    episode_id: string | null;
    kind: CandidateKind;
    type: string;
    title: string;
    content: string;
    status: CandidateStatus;
    source_title: string | null;
    source_content: string | null;
    source_created_at: string | null;
    metadata_json: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        memory_candidates.candidate_id AS candidate_id,
        memory_candidates.session_id AS session_id,
        memory_candidates.message_id AS message_id,
        memory_candidates.episode_id AS episode_id,
        memory_candidates.kind AS kind,
        memory_candidates.type AS type,
        memory_candidates.title AS title,
        memory_candidates.content AS content,
        memory_candidates.status AS status,
        memory_candidates.metadata_json AS metadata_json,
        memory_candidates.created_at AS created_at,
        memory_candidates.updated_at AS updated_at,
        episodes.title AS source_title,
        episodes.content AS source_content,
        episodes.created_at AS source_created_at
      FROM memory_candidates
      LEFT JOIN episodes ON episodes.episode_id = memory_candidates.episode_id
      WHERE candidate_id = ?
    `,
    candidateId,
  );
  return row ? toCandidate(row) : null;
}

const toCandidate = (row: {
  candidate_id: string;
  session_id?: string | null;
  message_id?: string | null;
  episode_id?: string | null;
  kind: CandidateKind;
  type: string;
  title: string;
  content: string;
  status: CandidateStatus;
  source_title?: string | null;
  source_content?: string | null;
  source_created_at?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at?: string | null;
}): MemoryCandidate => ({
  id: row.candidate_id,
  sessionId: row.session_id ?? undefined,
  messageId: row.message_id ?? undefined,
  episodeId: row.episode_id ?? undefined,
  kind: row.kind,
  type: row.type,
  title: row.title,
  content: row.content,
  status: row.status,
  sourceTitle: row.source_title ?? undefined,
  sourceContent: row.source_content ?? undefined,
  sourceCreatedAt: row.source_created_at ?? undefined,
  metadata: parseJson(row.metadata_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
});

export async function listMemoryCandidates(
  db: SQLiteDatabase,
  status?: CandidateStatus,
): Promise<MemoryCandidate[]> {
  const rows = await db.getAllAsync<any>(
    `
      SELECT
        memory_candidates.candidate_id AS candidate_id,
        memory_candidates.session_id AS session_id,
        memory_candidates.message_id AS message_id,
        memory_candidates.episode_id AS episode_id,
        memory_candidates.kind AS kind,
        memory_candidates.type AS type,
        memory_candidates.title AS title,
        memory_candidates.content AS content,
        memory_candidates.status AS status,
        memory_candidates.metadata_json AS metadata_json,
        memory_candidates.created_at AS created_at,
        memory_candidates.updated_at AS updated_at,
        episodes.title AS source_title,
        episodes.content AS source_content,
        episodes.created_at AS source_created_at
      FROM memory_candidates
      LEFT JOIN episodes ON episodes.episode_id = memory_candidates.episode_id
      ${status ? "WHERE status = ?" : ""}
      ORDER BY memory_candidates.created_at DESC
    `,
    ...(status ? [status] : []),
  );
  return rows.map(toCandidate);
}

export async function listStoredMemories(db: SQLiteDatabase): Promise<StoredMemory[]> {
  const rows = await db.getAllAsync<{
    memory_id: string;
    candidate_id: string | null;
    episode_id: string | null;
    session_id: string | null;
    message_id: string | null;
    type: string;
    content: string;
    importance: number;
    source_title: string | null;
    source_content: string | null;
    source_created_at: string | null;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT
      memory_atoms.memory_id AS memory_id,
      memory_atoms.candidate_id AS candidate_id,
      memory_atoms.episode_id AS episode_id,
      memory_atoms.session_id AS session_id,
      memory_atoms.message_id AS message_id,
      memory_atoms.type AS type,
      memory_atoms.content AS content,
      memory_atoms.importance AS importance,
      memory_atoms.created_at AS created_at,
      memory_atoms.updated_at AS updated_at,
      episodes.title AS source_title,
      episodes.content AS source_content,
      episodes.created_at AS source_created_at
    FROM memory_atoms
    LEFT JOIN episodes ON episodes.episode_id = memory_atoms.episode_id
    WHERE status = 'active'
    ORDER BY memory_atoms.created_at DESC
  `);

  return rows.map((row) => ({
    id: row.memory_id,
    candidateId: row.candidate_id ?? undefined,
    episodeId: row.episode_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    messageId: row.message_id ?? undefined,
    type: row.type,
    content: row.content,
    importance: row.importance,
    sourceTitle: row.source_title ?? undefined,
    sourceContent: row.source_content ?? undefined,
    sourceCreatedAt: row.source_created_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listReflections(db: SQLiteDatabase): Promise<ReflectionRecord[]> {
  const rows = await db.getAllAsync<{
    reflection_id: string;
    candidate_id: string | null;
    title: string;
    content: string;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
  }>(`
    SELECT reflection_id, candidate_id, title, content, status, created_at, updated_at
    FROM reflections
    WHERE status = 'active'
    ORDER BY created_at DESC
  `);

  return rows.map((row) => ({
    id: row.reflection_id,
    candidateId: row.candidate_id ?? undefined,
    title: row.title,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateReflectionContent(
  db: SQLiteDatabase,
  reflectionId: string,
  title: string,
  content: string,
) {
  const nextTitle = title.trim();
  const nextContent = content.trim();
  if (!nextTitle || !nextContent) return;
  const updatedAt = nowIso();

  await db.runAsync(
    `
      UPDATE reflections
      SET title = ?, content = ?, updated_at = ?
      WHERE reflection_id = ? AND status = 'active'
    `,
    nextTitle,
    nextContent,
    updatedAt,
    reflectionId,
  );
  await insertReflectionFts(db, {
    id: reflectionId,
    title: nextTitle,
    content: nextContent,
  });
}

export async function archiveReflection(db: SQLiteDatabase, reflectionId: string) {
  const updatedAt = nowIso();
  await db.runAsync(
    `
      UPDATE reflections
      SET status = 'archived', updated_at = ?
      WHERE reflection_id = ?
    `,
    updatedAt,
    reflectionId,
  );
  if (await isFtsAvailable(db)) {
    await db.runAsync("DELETE FROM reflections_fts WHERE reflection_id = ?", reflectionId);
  }
}

export async function listEntities(db: SQLiteDatabase): Promise<EntityRecord[]> {
  const rows = await db.getAllAsync<{
    entity_id: string;
    name: string;
    type: string;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT entity_id, name, type, created_at, updated_at
    FROM entities
    ORDER BY updated_at DESC
    LIMIT 80
  `);

  return rows.map((row) => ({
    id: row.entity_id,
    name: row.name,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listRelations(db: SQLiteDatabase): Promise<RelationRecord[]> {
  const rows = await db.getAllAsync<{
    relation_id: string;
    source_entity_id: string;
    target_entity_id: string;
    source_entity_name: string | null;
    target_entity_name: string | null;
    type: string;
    weight: number;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT
      relations.relation_id AS relation_id,
      relations.source_entity_id AS source_entity_id,
      relations.target_entity_id AS target_entity_id,
      source_entities.name AS source_entity_name,
      target_entities.name AS target_entity_name,
      relations.type AS type,
      relations.weight AS weight,
      relations.created_at AS created_at,
      relations.updated_at AS updated_at
    FROM relations
    LEFT JOIN entities AS source_entities ON source_entities.entity_id = relations.source_entity_id
    LEFT JOIN entities AS target_entities ON target_entities.entity_id = relations.target_entity_id
    ORDER BY relations.weight DESC, relations.updated_at DESC
    LIMIT 120
  `);

  return rows.map((row) => ({
    id: row.relation_id,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    sourceEntityName: row.source_entity_name ?? undefined,
    targetEntityName: row.target_entity_name ?? undefined,
    type: row.type,
    weight: row.weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateStoredMemoryContent(
  db: SQLiteDatabase,
  memoryId: string,
  content: string,
) {
  const trimmed = content.trim();
  if (!trimmed) return;
  const updatedAt = nowIso();
  await db.runAsync(
    "UPDATE memory_atoms SET content = ?, updated_at = ? WHERE memory_id = ?",
    trimmed,
    updatedAt,
    memoryId,
  );
  const row = await db.getFirstAsync<{ type: string; content: string }>(
    "SELECT type, content FROM memory_atoms WHERE memory_id = ?",
    memoryId,
  );
  if (row) await insertMemoryFts(db, { id: memoryId, type: row.type, content: row.content });
}

export async function dismissStoredMemory(db: SQLiteDatabase, memoryId: string) {
  await db.runAsync(
    "UPDATE memory_atoms SET status = 'archived', updated_at = ? WHERE memory_id = ?",
    nowIso(),
    memoryId,
  );
  if (await isFtsAvailable(db)) {
    await db.runAsync("DELETE FROM memory_atoms_fts WHERE memory_id = ?", memoryId);
  }
}

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

export async function listDevices(db: SQLiteDatabase): Promise<DeviceRecord[]> {
  const rows = await db.getAllAsync<{
    device_id: string;
    name: string;
    kind: string;
    status: DeviceStatus;
    last_seen_at: string | null;
    battery_level: number | null;
    firmware_version: string | null;
  }>(`
    SELECT device_id, name, kind, status, last_seen_at, battery_level, firmware_version
    FROM devices
    ORDER BY COALESCE(last_seen_at, updated_at) DESC
  `);
  return rows.map((row) => ({
    id: row.device_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    lastSeenAt: row.last_seen_at ?? undefined,
    batteryLevel: row.battery_level ?? undefined,
    firmwareVersion: row.firmware_version ?? undefined,
  }));
}

export async function upsertDevice(
  db: SQLiteDatabase,
  device: {
    id: string;
    name: string;
    kind?: string;
    status?: DeviceStatus;
    batteryLevel?: number;
    firmwareVersion?: string;
  },
) {
  const seenAt = nowIso();
  await db.runAsync(
    `
      INSERT INTO devices (
        device_id, name, kind, status, last_seen_at, battery_level, firmware_version,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        name = excluded.name,
        kind = excluded.kind,
        status = excluded.status,
        last_seen_at = excluded.last_seen_at,
        battery_level = COALESCE(excluded.battery_level, devices.battery_level),
        firmware_version = COALESCE(excluded.firmware_version, devices.firmware_version),
        updated_at = excluded.updated_at
    `,
    device.id,
    device.name,
    device.kind ?? "xiao-esp32s3-sense",
    device.status ?? "known",
    seenAt,
    device.batteryLevel ?? null,
    device.firmwareVersion ?? null,
    seenAt,
    seenAt,
  );
}

export async function updateDeviceStatus(
  db: SQLiteDatabase,
  deviceId: string,
  status: DeviceStatus,
) {
  await db.runAsync(
    `
      UPDATE devices
      SET status = ?, updated_at = ?
      WHERE device_id = ?
    `,
    status,
    nowIso(),
    deviceId,
  );
}

export async function createDeviceEvent(
  db: SQLiteDatabase,
  input: {
    id?: string;
    deviceId: string;
    eventType: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  },
): Promise<boolean> {
  const createdAt = input.createdAt ?? nowIso();
  const eventId = input.id ?? createId("device-event");
  let inserted = false;

  await runInTransaction(db, async () => {
    const result = await db.runAsync(
      `
        INSERT OR IGNORE INTO device_events (
          device_event_id, device_id, event_type, content, metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      eventId,
      input.deviceId,
      input.eventType,
      input.content,
      safeJson(input.metadata),
      createdAt,
    );
    inserted = result.changes > 0;
    if (!inserted) return;

    await createEpisode(db, {
      id: `episode-${eventId}`,
      source: "iot",
      title: input.eventType,
      content: input.content,
      metadata: { deviceId: input.deviceId, eventId, ...input.metadata },
      createdAt,
    });
  });

  return inserted;
}

export async function listDeviceEvents(db: SQLiteDatabase): Promise<DeviceEventRecord[]> {
  const rows = await db.getAllAsync<{
    device_event_id: string;
    device_id: string;
    device_name: string | null;
    event_type: string;
    content: string;
    metadata_json: string | null;
    created_at: string;
  }>(`
    SELECT
      device_events.device_event_id AS device_event_id,
      device_events.device_id AS device_id,
      devices.name AS device_name,
      device_events.event_type AS event_type,
      device_events.content AS content,
      device_events.metadata_json AS metadata_json,
      device_events.created_at AS created_at
    FROM device_events
    LEFT JOIN devices ON devices.device_id = device_events.device_id
    ORDER BY device_events.created_at DESC
    LIMIT 80
  `);
  return rows.map((row) => ({
    id: row.device_event_id,
    deviceId: row.device_id,
    deviceName: row.device_name ?? undefined,
    eventType: row.event_type,
    content: row.content,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  }));
}

export const toToolCardsFromCandidates = (candidates: MemoryCandidate[]) =>
  candidates.map(candidateToToolCard);
