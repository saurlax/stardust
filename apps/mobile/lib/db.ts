import type { SQLiteDatabase } from "expo-sqlite";

import type { NebulaTree } from "@/components/NebulaView";
import type { ChatMessage, MessageToolCard, ToolCardType } from "@/lib/chat/types";

export const DATABASE_NAME = "stardust.db";
const DATABASE_VERSION = 10;

export type EpisodeSource = "chat" | "share" | "image" | "calendar" | "iot" | "journal";
export type CandidateKind =
  | "memory"
  | "journal"
  | "reflection"
  | "entity"
  | "open_loop";
export type CandidateStatus = "pending" | "accepted" | "dismissed";
export type MemoryAtomType =
  | "preference"
  | "fact"
  | "relationship"
  | "project"
  | "concern"
  | "goal"
  | "routine"
  | "memory"
  | "task"
  | "opinion";
export type DeviceStatus = "known" | "connected" | "disconnected";

type ChatSessionRow = {
  session_id: string;
  remote_chat_id: string | null;
};

type ChatMessageRow = {
  message_id: string;
  role: ChatMessage["role"];
  content: string;
  status: ChatMessage["status"];
  image_uri: string | null;
  image_mime_type: string | null;
  error_text: string | null;
  request_prompt: string | null;
  request_image_uri: string | null;
  request_image_mime_type: string | null;
  request_episode_id: string | null;
  tool_cards_json: string | null;
  created_at: string;
};

export type Episode = {
  id: string;
  source: EpisodeSource;
  title?: string;
  content: string;
  mediaUri?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MemoryCandidate = {
  id: string;
  sessionId?: string;
  messageId?: string;
  episodeId?: string;
  kind: CandidateKind;
  type: string;
  title: string;
  content: string;
  status: CandidateStatus;
  sourceTitle?: string;
  sourceContent?: string;
  sourceCreatedAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type StoredMemory = {
  id: string;
  sessionId?: string;
  messageId?: string;
  episodeId?: string;
  type: string;
  content: string;
  importance: number;
  sourceTitle?: string;
  sourceContent?: string;
  sourceCreatedAt?: string;
  createdAt: string;
  updatedAt?: string;
  candidateId?: string;
};

export type ReflectionRecord = {
  id: string;
  candidateId?: string;
  title: string;
  content: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt?: string;
};

export type DeviceRecord = {
  id: string;
  name: string;
  kind: string;
  status: DeviceStatus;
  lastSeenAt?: string;
  batteryLevel?: number;
  firmwareVersion?: string;
};

export type EntityRecord = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt?: string;
};

export type RelationRecord = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceEntityName?: string;
  targetEntityName?: string;
  type: string;
  weight: number;
  createdAt: string;
  updatedAt?: string;
};

export type DeviceEventRecord = {
  id: string;
  deviceId: string;
  eventType: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type PersonalSnapshot = {
  acceptedMemories: number;
  pendingCards: number;
  journalEntries: number;
  episodeCount: number;
  reflectionCount: number;
  deviceCount: number;
  recentMemory?: StoredMemory;
};

export type JournalRecord = {
  id: string;
  content: string;
  kind: string;
  createdAt: string;
  updatedAt?: string;
};

export type JournalEntry = {
  id: string;
  timestamp: string;
  note: string;
  source: EpisodeSource | "memory";
};

export type JournalDay = {
  date: Date;
  entries: JournalEntry[];
};

export type RelevantKnowledge = {
  id: string;
  source: "memory" | "episode" | "reflection";
  type?: string;
  content: string;
  createdAt: string;
  rank: number;
};

const memoryTypeOrder = [
  "preference",
  "fact",
  "relationship",
  "project",
  "concern",
  "goal",
  "routine",
  "memory",
  "task",
  "opinion",
];

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

const safeJson = (value?: Record<string, unknown> | null) =>
  value ? JSON.stringify(value) : null;

const parseJson = (value?: string | null): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const parseToolCards = (value?: string | null): MessageToolCard[] | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as MessageToolCard[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const serializeToolCards = (value?: MessageToolCard[]) =>
  value?.length ? JSON.stringify(value) : null;

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

let transactionQueue: Promise<void> = Promise.resolve();
let ftsAvailable: boolean | undefined;

async function runInTransaction<T>(db: SQLiteDatabase, task: () => Promise<T>): Promise<T> {
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

async function isFtsAvailable(db: SQLiteDatabase) {
  if (ftsAvailable !== undefined) return ftsAvailable;
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_support_check USING fts5(content);
      DROP TABLE IF EXISTS fts_support_check;
    `);
    ftsAvailable = true;
  } catch {
    ftsAvailable = false;
  }
  return ftsAvailable;
}

async function createCurrentTables(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = 'wal';

    CREATE TABLE IF NOT EXISTS chat_sessions (
      session_id TEXT PRIMARY KEY NOT NULL,
      remote_chat_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      session_id TEXT NOT NULL,
      message_id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      image_uri TEXT,
      image_mime_type TEXT,
      error_text TEXT,
      request_prompt TEXT,
      request_image_uri TEXT,
      request_image_mime_type TEXT,
      request_episode_id TEXT,
      tool_cards_json TEXT,
      sequence_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS episodes (
      episode_id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      media_uri TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memory_candidates (
      candidate_id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT,
      message_id TEXT,
      episode_id TEXT,
      kind TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memory_atoms (
      memory_id TEXT PRIMARY KEY NOT NULL,
      candidate_id TEXT,
      episode_id TEXT,
      session_id TEXT,
      message_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reflections (
      reflection_id TEXT PRIMARY KEY NOT NULL,
      candidate_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entities (
      entity_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, type)
    );

    CREATE TABLE IF NOT EXISTS relations (
      relation_id TEXT PRIMARY KEY NOT NULL,
      source_entity_id TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      type TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'known',
      last_seen_at TEXT,
      battery_level INTEGER,
      firmware_version TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_events (
      device_event_id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(device_id, device_event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_sequence ON chat_messages(session_id, sequence_index);
    CREATE INDEX IF NOT EXISTS idx_episodes_created_at ON episodes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_candidates_status ON memory_candidates(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_atoms_created_at ON memory_atoms(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reflections_created_at ON reflections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_device_events_created_at ON device_events(created_at DESC);
  `);

  if (await isFtsAvailable(db)) {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
        episode_id UNINDEXED,
        source,
        title,
        content
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_atoms_fts USING fts5(
        memory_id UNINDEXED,
        type,
        content
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS reflections_fts USING fts5(
        reflection_id UNINDEXED,
        title,
        content
      );
    `);
  }
}

async function dropLegacyTables(db: SQLiteDatabase) {
  await db.execAsync(`
    DROP TABLE IF EXISTS memory_candidates;
    DROP TABLE IF EXISTS memories;
    DROP TABLE IF EXISTS journals;
    DROP TABLE IF EXISTS captures;
    DROP TABLE IF EXISTS episodes;
    DROP TABLE IF EXISTS memory_atoms;
    DROP TABLE IF EXISTS reflections;
    DROP TABLE IF EXISTS entities;
    DROP TABLE IF EXISTS relations;
    DROP TABLE IF EXISTS devices;
    DROP TABLE IF EXISTS device_events;
    DROP TABLE IF EXISTS chat_messages;
    DROP TABLE IF EXISTS chat_sessions;
    DROP TABLE IF EXISTS episodes_fts;
    DROP TABLE IF EXISTS memory_atoms_fts;
    DROP TABLE IF EXISTS reflections_fts;
    DROP TABLE IF EXISTS journals_fts;
    DROP TABLE IF EXISTS memories_fts;
  `);
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion === DATABASE_VERSION) return;

  await dropLegacyTables(db);
  await createCurrentTables(db);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function loadLatestChatSession(db: SQLiteDatabase) {
  const session = await db.getFirstAsync<ChatSessionRow>(`
    SELECT session_id, remote_chat_id
    FROM chat_sessions
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  if (!session) return null;

  const rows = await db.getAllAsync<ChatMessageRow>(
    `
      SELECT message_id, role, content, status, image_uri, image_mime_type, error_text,
        request_prompt, request_image_uri, request_image_mime_type, request_episode_id,
        tool_cards_json, created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY sequence_index ASC
    `,
    session.session_id,
  );

  const messages: ChatMessage[] = rows.map((row) => ({
    id: row.message_id,
    role: row.role,
    content: row.content,
    status: row.status,
    imageUri: row.image_uri ?? undefined,
    imageMimeType: row.image_mime_type ?? undefined,
    error: row.error_text ?? undefined,
    createdAt: row.created_at,
    request: row.request_prompt
      ? {
          prompt: row.request_prompt,
          imageUri: row.request_image_uri ?? undefined,
          imageMimeType: row.request_image_mime_type ?? undefined,
          episodeId: row.request_episode_id ?? undefined,
        }
      : undefined,
    toolCards: parseToolCards(row.tool_cards_json),
  }));

  return { sessionId: session.session_id, remoteChatId: session.remote_chat_id, messages };
}

export async function saveChatSessionSnapshot(
  db: SQLiteDatabase,
  {
    sessionId,
    remoteChatId,
    messages,
  }: {
    sessionId: string;
    remoteChatId?: string | null;
    messages: ChatMessage[];
  },
) {
  await runInTransaction(db, async () => {
    await db.runAsync(
      `
        INSERT INTO chat_sessions (session_id, remote_chat_id, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id) DO UPDATE SET
          remote_chat_id = excluded.remote_chat_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      sessionId,
      remoteChatId ?? null,
    );

    await db.runAsync("DELETE FROM chat_messages WHERE session_id = ?", sessionId);

    for (const [index, message] of messages.entries()) {
      await db.runAsync(
        `
          INSERT INTO chat_messages (
            session_id, message_id, role, content, status, image_uri, image_mime_type,
            error_text, request_prompt, request_image_uri, request_image_mime_type,
            request_episode_id,
            tool_cards_json, sequence_index, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        sessionId,
        message.id,
        message.role,
        message.content,
        message.status,
        message.imageUri ?? null,
        message.imageMimeType ?? null,
        message.error ?? null,
        message.request?.prompt ?? null,
        message.request?.imageUri ?? null,
        message.request?.imageMimeType ?? null,
        message.request?.episodeId ?? null,
        serializeToolCards(message.toolCards),
        index,
        message.createdAt ?? nowIso(),
        nowIso(),
      );
    }
  });
}

async function insertEpisodeFts(db: SQLiteDatabase, episode: Episode) {
  if (!(await isFtsAvailable(db))) return;
  await db.runAsync("DELETE FROM episodes_fts WHERE episode_id = ?", episode.id);
  await db.runAsync(
    `
      INSERT INTO episodes_fts (episode_id, source, title, content)
      VALUES (?, ?, ?, ?)
    `,
    episode.id,
    episode.source,
    episode.title ?? "",
    episode.content,
  );
}

export async function createEpisode(
  db: SQLiteDatabase,
  input: {
    id?: string;
    source: EpisodeSource;
    title?: string;
    content: string;
    mediaUri?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  },
): Promise<Episode> {
  const episode: Episode = {
    id: input.id ?? createId("episode"),
    source: input.source,
    title: input.title,
    content: input.content.trim(),
    mediaUri: input.mediaUri,
    metadata: input.metadata,
    createdAt: input.createdAt ?? nowIso(),
  };
  if (!episode.content) return episode;

  await db.runAsync(
    `
      INSERT INTO episodes (
        episode_id, source, title, content, media_uri, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(episode_id) DO UPDATE SET
        source = excluded.source,
        title = excluded.title,
        content = excluded.content,
        media_uri = excluded.media_uri,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `,
    episode.id,
    episode.source,
    episode.title ?? null,
    episode.content,
    episode.mediaUri ?? null,
    safeJson(episode.metadata),
    episode.createdAt,
    episode.createdAt,
  );
  await insertEpisodeFts(db, episode);
  return episode;
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

export async function listEpisodes(db: SQLiteDatabase, limit = 120): Promise<Episode[]> {
  const rows = await db.getAllAsync<{
    episode_id: string;
    source: EpisodeSource;
    title: string | null;
    content: string;
    media_uri: string | null;
    metadata_json: string | null;
    created_at: string;
  }>(
    `
      SELECT episode_id, source, title, content, media_uri, metadata_json, created_at
      FROM episodes
      ORDER BY created_at DESC
      LIMIT ?
    `,
    limit,
  );

  return rows.map((row) => ({
    id: row.episode_id,
    source: row.source,
    title: row.title ?? undefined,
    content: row.content,
    mediaUri: row.media_uri ?? undefined,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  }));
}

export async function listJournalRecords(db: SQLiteDatabase): Promise<JournalRecord[]> {
  const episodes = await listEpisodes(db);
  return episodes
    .filter((episode) => episode.source === "journal")
    .map((episode) => ({
      id: episode.id,
      content: episode.content,
      kind: episode.source,
      createdAt: episode.createdAt,
    }));
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

export async function updateJournalContent(db: SQLiteDatabase, episodeId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) return;
  const updatedAt = nowIso();
  await db.runAsync(
    "UPDATE episodes SET content = ?, updated_at = ? WHERE episode_id = ?",
    trimmed,
    updatedAt,
    episodeId,
  );
  if (await isFtsAvailable(db)) {
    await db.runAsync("DELETE FROM episodes_fts WHERE episode_id = ?", episodeId);
    const episode = await db.getFirstAsync<{
      episode_id: string;
      source: EpisodeSource;
      title: string | null;
      content: string;
      media_uri: string | null;
      metadata_json: string | null;
      created_at: string;
    }>("SELECT * FROM episodes WHERE episode_id = ?", episodeId);
    if (episode) {
      await insertEpisodeFts(db, {
        id: episode.episode_id,
        source: episode.source,
        title: episode.title ?? undefined,
        content: episode.content,
        mediaUri: episode.media_uri ?? undefined,
        metadata: parseJson(episode.metadata_json),
        createdAt: episode.created_at,
      });
    }
  }
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
    const [memoryRows, episodeRows, reflectionRows] = await Promise.all([
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
    ]);
    return [
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
    ]
      .sort((a, b) => a.rank - b.rank || Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  const [memoryRows, episodeRows, reflectionRows] = await Promise.all([
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
  ]);

  return [
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
  ]
    .sort((a, b) => a.rank - b.rank || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
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
    event_type: string;
    content: string;
    metadata_json: string | null;
    created_at: string;
  }>(`
    SELECT device_event_id, device_id, event_type, content, metadata_json, created_at
    FROM device_events
    ORDER BY created_at DESC
    LIMIT 80
  `);
  return rows.map((row) => ({
    id: row.device_event_id,
    deviceId: row.device_id,
    eventType: row.event_type,
    content: row.content,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  }));
}

export const buildMemoryTree = (
  memories: StoredMemory[],
  reflections: ReflectionRecord[] = [],
  entities: EntityRecord[] = [],
  relations: RelationRecord[] = [],
): NebulaTree => {
  const nodes: NebulaTree["nodes"] = [{ id: "root", title: "you", size: 10 }];
  const visibleMemories = memories.slice(0, 48);
  const visibleReflections = reflections.slice(0, 8);
  const typeNodes = new Set<string>();

  for (const type of memoryTypeOrder) {
    if (!visibleMemories.some((memory) => memory.type === type)) continue;
    typeNodes.add(type);
    nodes.push({
      id: `type-${type}`,
      title: type,
      linksTo: ["root"],
      size: 7.5,
    });
  }

  visibleReflections.forEach((reflection, index) => {
    nodes.push({
      id: `reflection-${reflection.id}`,
      title: reflection.title.length > 18 ? `${reflection.title.slice(0, 18)}...` : reflection.title,
      linksTo: ["root"],
      size: 8 - index * 0.15,
    });
  });

  const visibleEntities = entities.filter((entity) => entity.id !== SELF_ENTITY_ID).slice(0, 16);
  const visibleEntityIds = new Set(visibleEntities.map((entity) => entity.id));

  visibleEntities.forEach((entity, index) => {
    const relationLinks = relations
      .filter((relation) => relation.targetEntityId === entity.id)
      .flatMap((relation) => {
        if (relation.sourceEntityId === SELF_ENTITY_ID) return ["root"];
        return visibleEntityIds.has(relation.sourceEntityId)
          ? [`entity-${relation.sourceEntityId}`]
          : [];
      });
    nodes.push({
      id: `entity-${entity.id}`,
      title: entity.name.length > 18 ? `${entity.name.slice(0, 18)}...` : entity.name,
      linksTo: relationLinks.length ? relationLinks : ["root"],
      size: 6.8 - Math.min(index, 12) * 0.08,
    });
  });

  visibleMemories.forEach((memory, index) => {
    const parentId = typeNodes.has(memory.type) ? `type-${memory.type}` : "root";
    const tokens = tokenize(memory.content);
    const related = visibleMemories
      .slice(0, index)
      .find((previous) => tokenize(previous.content).some((token) => tokens.includes(token)));
    nodes.push({
      id: `memory-${memory.id}`,
      title: memory.content.length > 20 ? `${memory.content.slice(0, 20)}...` : memory.content,
      linksTo: related ? [parentId, `memory-${related.id}`] : [parentId],
      size: 5.2 + Math.min(memory.importance, 5) * 0.35,
    });
  });

  return { nodes };
};

export const toToolCardsFromCandidates = (candidates: MemoryCandidate[]) =>
  candidates.map(candidateToToolCard);
