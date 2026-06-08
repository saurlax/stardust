import type { SQLiteDatabase } from "expo-sqlite";
import type { NebulaTree } from "@/components/NebulaView";
import type { ChatMessage, MessageMemoryCandidate } from "@/lib/chat/types";

export const DATABASE_NAME = "stardust.db";
const DATABASE_VERSION = 2;

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
  created_at: string;
};

type CandidateRow = {
  message_id: string;
  candidate_id: string;
  type: string;
  content: string;
  status: MessageMemoryCandidate["status"];
  created_at: string;
};

export type StoredMemory = {
  id: string;
  sessionId: string;
  messageId: string;
  type: string;
  content: string;
  status: MessageMemoryCandidate["status"];
  createdAt: string;
};

export type PersonalSnapshot = {
  acceptedMemories: number;
  pendingCandidates: number;
  userMessages: number;
  recentMemory?: StoredMemory;
};

export type JournalEntry = {
  id: string;
  timestamp: string;
  note: string;
  source: "capture" | "memory";
};

export type JournalDay = {
  date: Date;
  entries: JournalEntry[];
};

export type CaptureRecord = {
  id: string;
  sessionId: string;
  messageId: string;
  content: string;
  createdAt: string;
};

const typeOrder = ["preference", "memory", "task", "opinion"];

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
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
        sequence_index INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_candidates (
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, candidate_id),
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
      ON chat_sessions(updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_sequence
      ON chat_messages(session_id, sequence_index);

      CREATE INDEX IF NOT EXISTS idx_memory_candidates_status_created_at
      ON memory_candidates(status, created_at DESC);
    `);

    currentVersion = 1;
  }

  if (currentVersion === 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS captures (
        capture_id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
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
        candidate_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source_capture_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE,
        FOREIGN KEY (source_capture_id) REFERENCES captures(capture_id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_candidate_id
      ON memories(candidate_id);

      CREATE INDEX IF NOT EXISTS idx_captures_created_at
      ON captures(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memories_created_at
      ON memories(created_at DESC);
    `);

    const userMessages = await db.getAllAsync<{
      session_id: string;
      message_id: string;
      content: string;
      created_at: string;
    }>(`
      SELECT session_id, message_id, content, created_at
      FROM chat_messages
      WHERE role = 'user' AND content <> ''
    `);

    for (const row of userMessages) {
      await db.runAsync(
        `
          INSERT OR IGNORE INTO captures (
            capture_id,
            session_id,
            message_id,
            content,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        `capture-${row.message_id}`,
        row.session_id,
        row.message_id,
        row.content,
        row.created_at,
        row.created_at,
      );
    }

    const acceptedCandidates = await db.getAllAsync<{
      session_id: string;
      message_id: string;
      candidate_id: string;
      type: string;
      content: string;
      created_at: string;
    }>(`
      SELECT session_id, message_id, candidate_id, type, content, created_at
      FROM memory_candidates
      WHERE status = 'accepted'
    `);

    for (const row of acceptedCandidates) {
      const capture = await db.getFirstAsync<{ capture_id: string }>(
        `
          SELECT capture_id
          FROM captures
          WHERE session_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
        row.session_id,
      );

      await db.runAsync(
        `
          INSERT OR IGNORE INTO memories (
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
        `memory-${row.candidate_id}`,
        row.session_id,
        row.message_id,
        row.candidate_id,
        row.type,
        row.content,
        capture?.capture_id ?? null,
        row.created_at,
        row.created_at,
      );
    }

    currentVersion = 2;
  }

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

  const messageRows = await db.getAllAsync<ChatMessageRow>(
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
        created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY sequence_index ASC
    `,
    session.session_id,
  );

  const candidateRows = await db.getAllAsync<CandidateRow>(
    `
      SELECT message_id, candidate_id, type, content, status, created_at
      FROM memory_candidates
      WHERE session_id = ?
      ORDER BY created_at ASC
    `,
    session.session_id,
  );

  const candidatesByMessage = new Map<string, MessageMemoryCandidate[]>();
  for (const candidate of candidateRows) {
    const existing = candidatesByMessage.get(candidate.message_id) ?? [];
    existing.push({
      id: candidate.candidate_id,
      type: candidate.type,
      content: candidate.content,
      status: candidate.status,
      createdAt: candidate.created_at,
    });
    candidatesByMessage.set(candidate.message_id, existing);
  }

  const messages: ChatMessage[] = messageRows.map((row) => ({
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
    candidates: candidatesByMessage.get(row.message_id),
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

    await db.runAsync("DELETE FROM memory_candidates WHERE session_id = ?", sessionId);
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
            sequence_index,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        index,
        message.createdAt ?? new Date().toISOString(),
        message.createdAt ?? new Date().toISOString(),
      );

      for (const candidate of message.candidates ?? []) {
        await db.runAsync(
          `
            INSERT INTO memory_candidates (
              session_id,
              message_id,
              candidate_id,
            type,
            content,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          sessionId,
          message.id,
          candidate.id,
          candidate.type,
          candidate.content,
          candidate.status,
          candidate.createdAt ?? message.createdAt ?? new Date().toISOString(),
          candidate.createdAt ?? message.createdAt ?? new Date().toISOString(),
        );
      }
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
    for (const message of messages) {
      if (message.role === "user" && message.content.trim()) {
        const captureId = `capture-${message.id}`;
        await db.runAsync(
          `
            INSERT INTO captures (
              capture_id,
              session_id,
              message_id,
              content,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET
              content = excluded.content,
              updated_at = excluded.updated_at
          `,
          captureId,
          sessionId,
          message.id,
          message.content,
          message.createdAt ?? new Date().toISOString(),
          message.createdAt ?? new Date().toISOString(),
        );
      }

      for (const candidate of message.candidates ?? []) {
        if (candidate.status !== "accepted") {
          await db.runAsync(
            "DELETE FROM memories WHERE candidate_id = ?",
            candidate.id,
          );
          continue;
        }

        const sourceCapture = await db.getFirstAsync<{ capture_id: string }>(
          `
            SELECT capture_id
            FROM captures
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT 1
          `,
          sessionId,
        );

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
            ON CONFLICT(candidate_id) DO UPDATE SET
              type = excluded.type,
              content = excluded.content,
              source_capture_id = excluded.source_capture_id,
              updated_at = excluded.updated_at
          `,
          `memory-${candidate.id}`,
          sessionId,
          message.id,
          candidate.id,
          candidate.type,
          candidate.content,
          sourceCapture?.capture_id ?? null,
          candidate.createdAt ?? message.createdAt ?? new Date().toISOString(),
          candidate.createdAt ?? message.createdAt ?? new Date().toISOString(),
        );
      }
    }

    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

export async function listStoredMemories(
  db: SQLiteDatabase,
): Promise<StoredMemory[]> {
  const rows = await db.getAllAsync<{
    session_id: string;
    message_id: string;
    candidate_id: string;
    type: string;
    content: string;
    created_at: string;
  }>(
    `
      SELECT session_id, message_id, candidate_id, type, content, created_at
      FROM memories
      ORDER BY created_at DESC
    `,
  );

  return rows.map((row) => ({
    id: row.candidate_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    type: row.type,
    content: row.content,
    status: "accepted",
    createdAt: row.created_at,
  }));
}

export async function findRelevantMemories(
  db: SQLiteDatabase,
  query: string,
  limit = 5,
): Promise<StoredMemory[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return listStoredMemories(db).then((memories) => memories.slice(0, limit));
  }

  const accepted = await listStoredMemories(db);
  const tokens = [...new Set(trimmed.split(/\s+/).filter(Boolean))];

  return accepted
    .map((memory) => {
      const haystack = `${memory.type} ${memory.content}`.toLowerCase();
      const score = tokens.reduce(
        (total, token) => total + (haystack.includes(token) ? 1 : 0),
        0,
      );

      return { memory, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.memory.createdAt) - Date.parse(a.memory.createdAt))
    .slice(0, limit)
    .map((item) => item.memory);
}

export async function getPersonalSnapshot(
  db: SQLiteDatabase,
): Promise<PersonalSnapshot> {
  const [acceptedRow, pendingRow, userMessagesRow, recentMemoryRow] =
    await Promise.all([
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memories",
      ),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memory_candidates WHERE status = 'pending'",
      ),
      db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM chat_messages WHERE role = 'user'",
      ),
      db.getFirstAsync<{
        session_id: string;
        message_id: string;
        candidate_id: string;
        type: string;
        content: string;
        created_at: string;
      }>(
        `
          SELECT session_id, message_id, candidate_id, type, content, created_at
          FROM memories
          ORDER BY created_at DESC
          LIMIT 1
        `,
      ),
    ]);

  return {
    acceptedMemories: acceptedRow?.count ?? 0,
    pendingCandidates: pendingRow?.count ?? 0,
    userMessages: userMessagesRow?.count ?? 0,
    recentMemory: recentMemoryRow
      ? {
          id: recentMemoryRow.candidate_id,
          sessionId: recentMemoryRow.session_id,
          messageId: recentMemoryRow.message_id,
          type: recentMemoryRow.type,
          content: recentMemoryRow.content,
          status: "accepted",
          createdAt: recentMemoryRow.created_at,
        }
      : undefined,
  };
}

export async function listJournalDays(db: SQLiteDatabase): Promise<JournalDay[]> {
  const [captureRows, memoryRows] = await Promise.all([
    db.getAllAsync<{
      capture_id: string;
      content: string;
      created_at: string;
    }>(
      `
        SELECT capture_id, content, created_at
        FROM captures
        ORDER BY created_at DESC
      `,
    ),
    listStoredMemories(db),
  ]);

  const entries: JournalEntry[] = [
    ...captureRows.map((row) => ({
      id: row.capture_id,
      timestamp: row.created_at,
      note: row.content,
      source: "capture" as const,
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
    const dateKey = date.toISOString().slice(0, 10);
    const existing = grouped.get(dateKey);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    grouped.set(dateKey, {
      date,
      entries: [entry],
    });
  }

  return [...grouped.values()].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}

export const buildMemoryTree = (memories: StoredMemory[]): NebulaTree => {
  if (!memories.length) {
    return {
      nodes: [{ id: "root", title: "you" }],
    };
  }

  const nodes: NebulaTree["nodes"] = [{ id: "root", title: "you" }];
  const typeNodes = new Set<string>();

  for (const type of typeOrder) {
    if (!memories.some((memory) => memory.type === type)) continue;
    typeNodes.add(type);
    nodes.push({
      id: `type-${type}`,
      title: type,
      linksTo: ["root"],
    });
  }

  memories.slice(0, 18).forEach((memory) => {
    const parentId = typeNodes.has(memory.type) ? `type-${memory.type}` : "root";
    nodes.push({
      id: `memory-${memory.id}`,
      title: memory.content.length > 18 ? `${memory.content.slice(0, 18)}...` : memory.content,
      linksTo: [parentId],
    });
  });

  return { nodes };
};
