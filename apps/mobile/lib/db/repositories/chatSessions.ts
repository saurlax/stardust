import type { SQLiteDatabase } from "expo-sqlite";

import type { ChatMessage } from "@/lib/chat/types";
import {
  parseMemoryContext,
  parseToolCards,
  serializeMemoryContext,
  serializeToolCards,
} from "@/lib/db/serialization";
import type { ChatMessageRow, ChatSessionRow, ChatSessionSummary } from "@/lib/db/types";
import { runInTransaction } from "@/lib/db/transactions";

const nowIso = () => new Date().toISOString();

const rowToMessage = (row: ChatMessageRow): ChatMessage => {
  const memoryContext = parseMemoryContext(row.memory_context_json);
  return {
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
    memoryContext,
    memoryContextCount: memoryContext?.length,
    toolCards: parseToolCards(row.tool_cards_json),
  };
};

async function loadChatSessionMessages(db: SQLiteDatabase, sessionId: string) {
  const rows = await db.getAllAsync<ChatMessageRow>(
    `
      SELECT message_id, role, content, status, image_uri, image_mime_type, error_text,
        request_prompt, request_image_uri, request_image_mime_type, request_episode_id,
        memory_context_json, tool_cards_json, created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY sequence_index ASC
    `,
    sessionId,
  );

  return rows.map(rowToMessage);
}

export async function loadLatestChatSession(db: SQLiteDatabase) {
  const session = await db.getFirstAsync<ChatSessionRow>(`
    SELECT session_id, remote_chat_id
    FROM chat_sessions
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  if (!session) return null;

  const messages = await loadChatSessionMessages(db, session.session_id);

  return { sessionId: session.session_id, remoteChatId: session.remote_chat_id, messages };
}

export async function loadChatSession(db: SQLiteDatabase, sessionId: string) {
  const session = await db.getFirstAsync<ChatSessionRow>(
    `
      SELECT session_id, remote_chat_id
      FROM chat_sessions
      WHERE session_id = ?
    `,
    sessionId,
  );
  if (!session) return null;

  const messages = await loadChatSessionMessages(db, session.session_id);

  return { sessionId: session.session_id, remoteChatId: session.remote_chat_id, messages };
}

export async function listChatSessionSummaries(
  db: SQLiteDatabase,
  limit = 24,
): Promise<ChatSessionSummary[]> {
  const rows = await db.getAllAsync<{
    session_id: string;
    updated_at: string;
    message_count: number;
    first_user_content: string | null;
    latest_content: string | null;
  }>(
    `
      SELECT
        chat_sessions.session_id AS session_id,
        chat_sessions.updated_at AS updated_at,
        COUNT(chat_messages.message_id) AS message_count,
        (
          SELECT first_user.content
          FROM chat_messages AS first_user
          WHERE first_user.session_id = chat_sessions.session_id
            AND first_user.role = 'user'
          ORDER BY first_user.sequence_index ASC
          LIMIT 1
        ) AS first_user_content,
        (
          SELECT latest.content
          FROM chat_messages AS latest
          WHERE latest.session_id = chat_sessions.session_id
          ORDER BY latest.sequence_index DESC
          LIMIT 1
        ) AS latest_content
      FROM chat_sessions
      LEFT JOIN chat_messages ON chat_messages.session_id = chat_sessions.session_id
      GROUP BY chat_sessions.session_id
      ORDER BY chat_sessions.updated_at DESC
      LIMIT ?
    `,
    limit,
  );

  return rows.map((row) => {
    const title = (row.first_user_content ?? row.latest_content ?? "").trim();
    const preview = (row.latest_content ?? row.first_user_content ?? "").trim();
    return {
      sessionId: row.session_id,
      title,
      preview,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    };
  });
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
            memory_context_json, tool_cards_json, sequence_index, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        serializeMemoryContext(message.memoryContext),
        serializeToolCards(message.toolCards),
        index,
        message.createdAt ?? nowIso(),
        nowIso(),
      );
    }
  });
}
