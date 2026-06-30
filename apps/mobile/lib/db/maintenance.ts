import type { SQLiteDatabase } from "expo-sqlite";

import type { ChatMessage } from "@/lib/chat/types";
import { insertMemoryFts, insertReflectionFts } from "@/lib/db/fts";
import { createEpisodeInCurrentTransaction } from "@/lib/db/repositories/episodes";
import { isFtsAvailable } from "@/lib/db/schema";
import { safeJson, serializeToolCards } from "@/lib/db/serialization";
import { runInTransaction } from "@/lib/db/transactions";

const nowIso = () => new Date().toISOString();

const seedSessionId = "seed-welcome-session";
const seedEpisodeId = "seed-welcome-episode";
const seedCandidateId = "seed-welcome-candidate";
const seedMemoryId = "seed-welcome-memory";
const seedReflectionId = "seed-welcome-reflection";

const seedMessages = (createdAt: string): ChatMessage[] => [
  {
    id: "seed-user-1",
    role: "user",
    content: "我想试试看 Stardust 怎么记录生活和待办。",
    status: "done",
    createdAt,
  },
  {
    id: "seed-assistant-1",
    role: "assistant",
    content: "可以。从聊天、图片、分享和设备捕获开始，Stardust 会把值得保留的内容放进审核列表，确认后再成为长期记忆。",
    status: "done",
    createdAt,
    toolCards: [
      {
        id: seedCandidateId,
        type: "save_memory",
        title: "欢迎使用 Stardust",
        status: "accepted",
        createdAt,
        payload: {
          content: "用户正在试用 Stardust，希望用它记录生活、整理待办并沉淀长期记忆。",
          memoryType: "preference",
          importance: 3,
          rationale: "这有助于后续对话用更合适的方式介绍功能和示例。",
        },
      },
    ],
  },
];

async function clearCurrentData(db: SQLiteDatabase) {
  if (await isFtsAvailable(db)) {
    await db.execAsync(`
      DELETE FROM episodes_fts;
      DELETE FROM memory_atoms_fts;
      DELETE FROM reflections_fts;
    `);
  }

  await db.execAsync(`
    DELETE FROM relations;
    DELETE FROM device_events;
    DELETE FROM memory_atoms;
    DELETE FROM reflections;
    DELETE FROM memory_candidates;
    DELETE FROM chat_messages;
    DELETE FROM chat_sessions;
    DELETE FROM devices;
    DELETE FROM entities;
    DELETE FROM episodes;
  `);
}

async function seedWelcomeData(db: SQLiteDatabase) {
  const createdAt = nowIso();
  const messages = seedMessages(createdAt);

  await db.runAsync(
    `
      INSERT INTO chat_sessions (session_id, remote_chat_id, created_at, updated_at)
      VALUES (?, NULL, ?, ?)
    `,
    seedSessionId,
    createdAt,
    createdAt,
  );

  for (const [index, message] of messages.entries()) {
    await db.runAsync(
      `
        INSERT INTO chat_messages (
          session_id, message_id, role, content, status, image_uri, image_mime_type,
          error_text, request_prompt, request_image_uri, request_image_mime_type,
          request_episode_id, memory_context_json, tool_cards_json, sequence_index,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
      `,
      seedSessionId,
      message.id,
      message.role,
      message.content,
      message.status,
      serializeToolCards(message.toolCards),
      index,
      message.createdAt ?? createdAt,
      createdAt,
    );
  }

  await createEpisodeInCurrentTransaction(db, {
    id: seedEpisodeId,
    source: "chat",
    title: "Welcome",
    content: "A short welcome conversation showing how Stardust turns useful moments into reviewable memory.",
    metadata: { seed: true, sessionId: seedSessionId },
    createdAt,
  });

  await db.runAsync(
    `
      INSERT INTO memory_candidates (
        candidate_id, session_id, message_id, episode_id, kind, type, title,
        content, status, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'memory', 'preference', ?, ?, 'accepted', ?, ?, ?)
    `,
    seedCandidateId,
    seedSessionId,
    "seed-assistant-1",
    seedEpisodeId,
    "欢迎使用 Stardust",
    "用户正在试用 Stardust，希望用它记录生活、整理待办并沉淀长期记忆。",
    safeJson({
      seed: true,
      importance: 3,
      rationale: "这有助于后续对话用更合适的方式介绍功能和示例。",
    }),
    createdAt,
    createdAt,
  );

  await db.runAsync(
    `
      INSERT INTO memory_atoms (
        memory_id, candidate_id, episode_id, session_id, message_id, type,
        content, importance, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'preference', ?, 3, 'active', ?, ?)
    `,
    seedMemoryId,
    seedCandidateId,
    seedEpisodeId,
    seedSessionId,
    "seed-assistant-1",
    "用户正在试用 Stardust，希望用它记录生活、整理待办并沉淀长期记忆。",
    createdAt,
    createdAt,
  );
  await insertMemoryFts(db, {
    id: seedMemoryId,
    type: "preference",
    content: "用户正在试用 Stardust，希望用它记录生活、整理待办并沉淀长期记忆。",
  });

  await db.runAsync(
    `
      INSERT INTO reflections (
        reflection_id, candidate_id, episode_id, title, content, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `,
    seedReflectionId,
    seedCandidateId,
    seedEpisodeId,
    "本地优先",
    "Stardust 会先把新内容放在本机，重要信息经过确认后才进入长期记忆。",
    createdAt,
    createdAt,
  );
  await insertReflectionFts(db, {
    id: seedReflectionId,
    title: "本地优先",
    content: "Stardust 会先把新内容放在本机，重要信息经过确认后才进入长期记忆。",
  });

  await db.runAsync(
    `
      INSERT INTO entities (entity_id, name, type, created_at, updated_at)
      VALUES ('entity-self', 'you', 'person', ?, ?)
    `,
    createdAt,
    createdAt,
  );
  await db.runAsync(
    `
      INSERT INTO entities (entity_id, name, type, created_at, updated_at)
      VALUES ('entity-stardust', 'Stardust', 'product', ?, ?)
    `,
    createdAt,
    createdAt,
  );
  await db.runAsync(
    `
      INSERT INTO relations (
        relation_id, candidate_id, episode_id, source_entity_id, target_entity_id,
        type, weight, created_at, updated_at
      )
      VALUES ('relation-seed-user-stardust', ?, ?, 'entity-self', 'entity-stardust', 'uses', 1, ?, ?)
    `,
    seedCandidateId,
    seedEpisodeId,
    createdAt,
    createdAt,
  );
}

export async function resetLocalDataWithSeed(db: SQLiteDatabase) {
  await runInTransaction(db, async () => {
    await clearCurrentData(db);
    await seedWelcomeData(db);
  });
}

