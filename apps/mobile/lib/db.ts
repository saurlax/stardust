import type { SQLiteDatabase } from "expo-sqlite";

import type { NebulaTree } from "@/components/NebulaView";
import type { ChatMessage, MessageToolCard } from "@/lib/chat/types";

export const DATABASE_NAME = "stardust.db";
const DATABASE_VERSION = 4;

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
  tool_cards_json: string | null;
  created_at: string;
};

export type StoredMemory = {
  id: string;
  sessionId: string;
  messageId: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  candidateId?: string;
};

export type PersonalSnapshot = {
  acceptedMemories: number;
  pendingCards: number;
  journalEntries: number;
  recentMemory?: StoredMemory;
};

export type JournalRecord = {
  id: string;
  sessionId: string;
  messageId: string;
  content: string;
  kind: string;
  createdAt: string;
  updatedAt?: string;
};

export type JournalEntry = {
  id: string;
  timestamp: string;
  note: string;
  source: "journal" | "memory";
};

export type JournalDay = {
  date: Date;
  entries: JournalEntry[];
};

export type RelevantKnowledge = {
  id: string;
  source: "memory" | "journal";
  type?: string;
  content: string;
  createdAt: string;
  rank: number;
};

const typeOrder = ["preference", "memory", "task", "opinion"];

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2);

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

const toolCardTitle = (type: string, content: string) => {
  switch (type) {
    case "save_memory":
      return "Save memory";
    case "append_journal":
      return "Add journal entry";
    default:
      return content.length > 24 ? `${content.slice(0, 24)}...` : content;
  }
};

const toToolCardsFromLegacyCandidates = (
  rows: Array<{
    candidate_id: string;
    type: string;
    content: string;
    status: "pending" | "accepted" | "dismissed";
    created_at: string;
  }>,
): MessageToolCard[] =>
  rows.map((row) => ({
    id: row.candidate_id,
    type: "save_memory",
    status: row.status,
    title: toolCardTitle("save_memory", row.content),
    payload: {
      content: row.content,
      memoryType: row.type,
    },
    createdAt: row.created_at,
  }));

async function ensureToolCardsColumn(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(chat_messages)");
  if (!columns.some((column) => column.name === "tool_cards_json")) {
    await db.execAsync(`
      ALTER TABLE chat_messages
      ADD COLUMN tool_cards_json TEXT
    `);
  }
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
      tool_cards_json TEXT,
      sequence_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journals (
      journal_id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      memory_id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      candidate_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source_capture_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
    ON chat_sessions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_sequence
    ON chat_messages(session_id, sequence_index);

    CREATE INDEX IF NOT EXISTS idx_journals_created_at
    ON journals(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memories_created_at
    ON memories(created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS journals_fts USING fts5(
      journal_id UNINDEXED,
      content
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      memory_id UNINDEXED,
      type,
      content
    );
  `);
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion === 0) {
    await createCurrentTables(db);
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    return;
  }

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  await createCurrentTables(db);
  await ensureToolCardsColumn(db);

  if (currentVersion < 4) {
    const legacyCandidateRows = await db.getAllAsync<{
      message_id: string;
      candidate_id: string;
      type: string;
      content: string;
      status: "pending" | "accepted" | "dismissed";
      created_at: string;
    }>(`
      SELECT message_id, candidate_id, type, content, status, created_at
      FROM memory_candidates
      ORDER BY created_at ASC
    `).catch(() => []);

    const byMessage = new Map<string, typeof legacyCandidateRows>();
    for (const row of legacyCandidateRows) {
      const list = byMessage.get(row.message_id) ?? [];
      list.push(row);
      byMessage.set(row.message_id, list);
    }

    for (const [messageId, rows] of byMessage.entries()) {
      await db.runAsync(
        `
          UPDATE chat_messages
          SET tool_cards_json = ?
          WHERE message_id = ? AND (tool_cards_json IS NULL OR tool_cards_json = '')
        `,
        JSON.stringify(toToolCardsFromLegacyCandidates(rows)),
        messageId,
      );
    }

    const legacyCaptures = await db.getAllAsync<{
      capture_id: string;
      session_id: string;
      message_id: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT capture_id, session_id, message_id, content, created_at, updated_at
      FROM captures
    `).catch(() => []);

    for (const capture of legacyCaptures) {
      await db.runAsync(
        `
          INSERT OR IGNORE INTO journals (
            journal_id,
            session_id,
            message_id,
            kind,
            content,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        `journal-${capture.capture_id}`,
        capture.session_id,
        capture.message_id,
        "capture",
        capture.content,
        capture.created_at,
        capture.updated_at,
      );
    }

    await db.runAsync("DELETE FROM journals_fts");
    const journals = await db.getAllAsync<{ journal_id: string; content: string }>(`
      SELECT journal_id, content
      FROM journals
    `);

    for (const journal of journals) {
      await db.runAsync(
        `
          INSERT INTO journals_fts (journal_id, content)
          VALUES (?, ?)
        `,
        journal.journal_id,
        journal.content,
      );
    }

    await db.runAsync("DELETE FROM memories_fts");
    const memories = await db.getAllAsync<{
      memory_id: string;
      type: string;
      content: string;
    }>(`
      SELECT memory_id, type, content
      FROM memories
    `);

    for (const memory of memories) {
      await db.runAsync(
        `
          INSERT INTO memories_fts (memory_id, type, content)
          VALUES (?, ?, ?)
        `,
        memory.memory_id,
        memory.type,
        memory.content,
      );
    }

    currentVersion = 4;
  }

  await db.execAsync("PRAGMA foreign_keys = ON");
  await db.execAsync(`PRAGMA user_version = ${currentVersion}`);
}

export const createSessionId = () =>
  `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function loadLatestChatSession(db: SQLiteDatabase) {
  const session = await db.getFirstAsync<ChatSessionRow>(`
    SELECT session_id, remote_chat_id
    FROM chat_sessions
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  if (!session) {
    return null;
  }

  const rows = await db.getAllAsync<ChatMessageRow>(
    `
      SELECT
        message_id,
        role,
        content,
        status,
        image_uri,
        image_mime_type,
        error_text,
        request_prompt,
        request_image_uri,
        request_image_mime_type,
        tool_cards_json,
        created_at
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
        }
      : undefined,
    toolCards: parseToolCards(row.tool_cards_json),
  }));

  return {
    sessionId: session.session_id,
    remoteChatId: session.remote_chat_id,
    messages,
  };
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
  await db.execAsync("BEGIN");

  try {
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
            session_id,
            message_id,
            role,
            content,
            status,
            image_uri,
            image_mime_type,
            error_text,
            request_prompt,
            request_image_uri,
            request_image_mime_type,
            tool_cards_json,
            sequence_index,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        serializeToolCards(message.toolCards),
        index,
        message.createdAt ?? new Date().toISOString(),
        message.createdAt ?? new Date().toISOString(),
      );
    }

    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

export async function syncDerivedEntitiesForSession(
  db: SQLiteDatabase,
  sessionId: string,
  messages: ChatMessage[],
) {
  await db.execAsync("BEGIN");

  try {
    const [journalIds, memoryIds] = await Promise.all([
      db.getAllAsync<{ journal_id: string }>(
        `
          SELECT journal_id
          FROM journals
          WHERE session_id = ?
        `,
        sessionId,
      ),
      db.getAllAsync<{ memory_id: string }>(
        `
          SELECT memory_id
          FROM memories
          WHERE session_id = ?
        `,
        sessionId,
      ),
    ]);

    for (const journal of journalIds) {
      await db.runAsync("DELETE FROM journals_fts WHERE journal_id = ?", journal.journal_id);
    }

    for (const memory of memoryIds) {
      await db.runAsync("DELETE FROM memories_fts WHERE memory_id = ?", memory.memory_id);
    }

    await db.runAsync("DELETE FROM journals WHERE session_id = ?", sessionId);
    await db.runAsync("DELETE FROM memories WHERE session_id = ?", sessionId);

    for (const message of messages) {
      for (const card of message.toolCards ?? []) {
        if (card.status !== "accepted") continue;

        const createdAt = card.createdAt ?? message.createdAt ?? new Date().toISOString();
        const content = card.payload.content.trim();
        if (!content) continue;

        if (card.type === "save_memory") {
          const memoryType = card.payload.memoryType?.trim() || "memory";
          await db.runAsync(
            `
              INSERT INTO memories (
                memory_id,
                session_id,
                message_id,
                candidate_id,
                type,
                content,
                source_capture_id,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            `memory-${card.id}`,
            sessionId,
            message.id,
            card.id,
            memoryType,
            content,
            null,
            createdAt,
            createdAt,
          );
          await db.runAsync(
            `
              INSERT INTO memories_fts (memory_id, type, content)
              VALUES (?, ?, ?)
            `,
            `memory-${card.id}`,
            memoryType,
            content,
          );
          continue;
        }

        if (card.type === "append_journal") {
          await db.runAsync(
            `
              INSERT INTO journals (
                journal_id,
                session_id,
                message_id,
                kind,
                content,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            `journal-${card.id}`,
            sessionId,
            message.id,
            "assistant_card",
            content,
            createdAt,
            createdAt,
          );
          await db.runAsync(
            `
              INSERT INTO journals_fts (journal_id, content)
              VALUES (?, ?)
            `,
            `journal-${card.id}`,
            content,
          );
        }
      }
    }

    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

export async function listStoredMemories(db: SQLiteDatabase): Promise<StoredMemory[]> {
  const rows = await db.getAllAsync<{
    memory_id: string;
    session_id: string;
    message_id: string;
    candidate_id: string | null;
    type: string;
    content: string;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT memory_id, session_id, message_id, candidate_id, type, content, created_at, updated_at
    FROM memories
    ORDER BY created_at DESC
  `);

  return rows.map((row) => ({
    id: row.memory_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    type: row.type,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    candidateId: row.candidate_id ?? undefined,
  }));
}

export async function updateStoredMemoryContent(
  db: SQLiteDatabase,
  memoryId: string,
  content: string,
) {
  const trimmed = content.trim();
  if (!trimmed) return;

  const now = new Date().toISOString();
  await db.execAsync("BEGIN");

  try {
    await db.runAsync(
      `
        UPDATE memories
        SET content = ?, updated_at = ?
        WHERE memory_id = ?
      `,
      trimmed,
      now,
      memoryId,
    );

    await db.runAsync("DELETE FROM memories_fts WHERE memory_id = ?", memoryId);
    await db.runAsync(
      `
        INSERT INTO memories_fts (memory_id, type, content)
        SELECT memory_id, type, content
        FROM memories
        WHERE memory_id = ?
      `,
      memoryId,
    );

    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

export async function dismissStoredMemory(db: SQLiteDatabase, memoryId: string) {
  await db.execAsync("BEGIN");

  try {
    await db.runAsync("DELETE FROM memories_fts WHERE memory_id = ?", memoryId);
    await db.runAsync("DELETE FROM memories WHERE memory_id = ?", memoryId);
    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

const toFtsQuery = (query: string) =>
  query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(" OR ");

export async function findRelevantKnowledge(
  db: SQLiteDatabase,
  query: string,
  limit = 6,
): Promise<RelevantKnowledge[]> {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];

  const [memoryMatches, journalMatches] = await Promise.all([
    db.getAllAsync<{
      id: string;
      type: string;
      content: string;
      created_at: string;
      rank: number;
    }>(
      `
        SELECT
          memories.memory_id AS id,
          memories.type AS type,
          memories.content AS content,
          memories.created_at AS created_at,
          bm25(memories_fts) AS rank
        FROM memories_fts
        JOIN memories ON memories.memory_id = memories_fts.memory_id
        WHERE memories_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      ftsQuery,
      limit,
    ),
    db.getAllAsync<{
      id: string;
      kind: string;
      content: string;
      created_at: string;
      rank: number;
    }>(
      `
        SELECT
          journals.journal_id AS id,
          journals.kind AS kind,
          journals.content AS content,
          journals.created_at AS created_at,
          bm25(journals_fts) AS rank
        FROM journals_fts
        JOIN journals ON journals.journal_id = journals_fts.journal_id
        WHERE journals_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      ftsQuery,
      limit,
    ),
  ]);

  return [
    ...memoryMatches.map((item) => ({
      id: item.id,
      source: "memory" as const,
      type: item.type,
      content: item.content,
      createdAt: item.created_at,
      rank: item.rank,
    })),
    ...journalMatches.map((item) => ({
      id: item.id,
      source: "journal" as const,
      type: item.kind,
      content: item.content,
      createdAt: item.created_at,
      rank: item.rank,
    })),
  ]
    .sort((a, b) => a.rank - b.rank || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

const countPendingCards = (messages: Array<{ tool_cards_json: string | null }>) =>
  messages.reduce((total, message) => {
    const cards = parseToolCards(message.tool_cards_json);
    if (!cards?.length) return total;
    return total + cards.filter((card) => card.status === "pending").length;
  }, 0);

export async function getPersonalSnapshot(db: SQLiteDatabase): Promise<PersonalSnapshot> {
  const [acceptedRow, journalRow, pendingRows, recentMemoryRow] = await Promise.all([
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM memories"),
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM journals"),
    db.getAllAsync<{ tool_cards_json: string | null }>(`
      SELECT tool_cards_json
      FROM chat_messages
      WHERE role = 'assistant'
    `),
    db.getFirstAsync<{
      memory_id: string;
      session_id: string;
      message_id: string;
      candidate_id: string | null;
      type: string;
      content: string;
      created_at: string;
    }>(`
      SELECT memory_id, session_id, message_id, candidate_id, type, content, created_at
      FROM memories
      ORDER BY created_at DESC
      LIMIT 1
    `),
  ]);

  return {
    acceptedMemories: acceptedRow?.count ?? 0,
    pendingCards: countPendingCards(pendingRows),
    journalEntries: journalRow?.count ?? 0,
    recentMemory: recentMemoryRow
      ? {
          id: recentMemoryRow.memory_id,
          sessionId: recentMemoryRow.session_id,
          messageId: recentMemoryRow.message_id,
          type: recentMemoryRow.type,
          content: recentMemoryRow.content,
          createdAt: recentMemoryRow.created_at,
          candidateId: recentMemoryRow.candidate_id ?? undefined,
        }
      : undefined,
  };
}

export async function listJournalDays(db: SQLiteDatabase): Promise<JournalDay[]> {
  const [journalRows, memoryRows] = await Promise.all([listJournalRecords(db), listStoredMemories(db)]);

  const entries: JournalEntry[] = [
    ...journalRows.map((row) => ({
      id: row.id,
      timestamp: row.createdAt,
      note: row.content,
      source: "journal" as const,
    })),
    ...memoryRows.map((memory) => ({
      id: `memory-${memory.id}`,
      timestamp: memory.createdAt,
      note: memory.content,
      source: "memory" as const,
    })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const grouped = new Map<string, JournalDay>();

  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    const key = date.toISOString().slice(0, 10);
    const existing = grouped.get(key);

    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    grouped.set(key, { date, entries: [entry] });
  }

  return [...grouped.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function listJournalRecords(db: SQLiteDatabase): Promise<JournalRecord[]> {
  const rows = await db.getAllAsync<{
    journal_id: string;
    session_id: string;
    message_id: string;
    kind: string;
    content: string;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT journal_id, session_id, message_id, kind, content, created_at, updated_at
    FROM journals
    ORDER BY created_at DESC
  `);

  return rows.map((row) => ({
    id: row.journal_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    kind: row.kind,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateJournalContent(
  db: SQLiteDatabase,
  journalId: string,
  content: string,
) {
  const trimmed = content.trim();
  if (!trimmed) return;

  const now = new Date().toISOString();
  await db.execAsync("BEGIN");

  try {
    await db.runAsync(
      `
        UPDATE journals
        SET content = ?, updated_at = ?
        WHERE journal_id = ?
      `,
      trimmed,
      now,
      journalId,
    );

    await db.runAsync("DELETE FROM journals_fts WHERE journal_id = ?", journalId);
    await db.runAsync(
      `
        INSERT INTO journals_fts (journal_id, content)
        SELECT journal_id, content
        FROM journals
        WHERE journal_id = ?
      `,
      journalId,
    );

    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

export const buildMemoryTree = (memories: StoredMemory[]): NebulaTree => {
  if (!memories.length) {
    return {
      nodes: [{ id: "root", title: "you" }],
    };
  }

  const nodes: NebulaTree["nodes"] = [{ id: "root", title: "you" }];
  const typeNodes = new Set<string>();
  const visibleMemories = memories.slice(0, 18);

  for (const type of typeOrder) {
    if (!visibleMemories.some((memory) => memory.type === type)) continue;
    typeNodes.add(type);
    nodes.push({
      id: `type-${type}`,
      title: type,
      linksTo: ["root"],
    });
  }

  visibleMemories.forEach((memory, index) => {
    const parentId = typeNodes.has(memory.type) ? `type-${memory.type}` : "root";
    let relatedMemoryId: string | undefined;

    for (let prevIndex = index - 1; prevIndex >= 0; prevIndex -= 1) {
      const previous = visibleMemories[prevIndex];
      const overlap = tokenize(memory.content).filter((token) =>
        tokenize(previous.content).includes(token),
      );
      if (overlap.length > 0) {
        relatedMemoryId = `memory-${previous.id}`;
        break;
      }
    }

    nodes.push({
      id: `memory-${memory.id}`,
      title: memory.content.length > 18 ? `${memory.content.slice(0, 18)}...` : memory.content,
      linksTo: relatedMemoryId ? [parentId, relatedMemoryId] : [parentId],
    });
  });

  return { nodes };
};
