import type { SQLiteDatabase } from "expo-sqlite";

import { insertMemoryFts, insertReflectionFts } from "@/lib/db/fts";
import { isFtsAvailable } from "@/lib/db/schema";
import { runInTransaction } from "@/lib/db/transactions";
import type { EntityRecord, ReflectionRecord, RelationRecord, StoredMemory } from "@/lib/db/types";

const nowIso = () => new Date().toISOString();

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
    WHERE memory_atoms.status = 'active'
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
    episode_id: string | null;
    title: string;
    content: string;
    status: "active" | "archived";
    source_title: string | null;
    source_content: string | null;
    source_created_at: string | null;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT
      reflections.reflection_id AS reflection_id,
      reflections.candidate_id AS candidate_id,
      reflections.episode_id AS episode_id,
      reflections.title AS title,
      reflections.content AS content,
      reflections.status AS status,
      reflections.created_at AS created_at,
      reflections.updated_at AS updated_at,
      episodes.title AS source_title,
      episodes.content AS source_content,
      episodes.created_at AS source_created_at
    FROM reflections
    LEFT JOIN episodes ON episodes.episode_id = reflections.episode_id
    WHERE reflections.status = 'active'
    ORDER BY reflections.created_at DESC
  `);

  return rows.map((row) => ({
    id: row.reflection_id,
    candidateId: row.candidate_id ?? undefined,
    episodeId: row.episode_id ?? undefined,
    title: row.title,
    content: row.content,
    status: row.status,
    sourceTitle: row.source_title ?? undefined,
    sourceContent: row.source_content ?? undefined,
    sourceCreatedAt: row.source_created_at ?? undefined,
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

  await runInTransaction(db, async () => {
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
  });
}

export async function archiveReflection(db: SQLiteDatabase, reflectionId: string) {
  const updatedAt = nowIso();
  await runInTransaction(db, async () => {
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
  });
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
    candidate_id: string | null;
    episode_id: string | null;
    source_entity_id: string;
    target_entity_id: string;
    source_entity_name: string | null;
    target_entity_name: string | null;
    source_title: string | null;
    source_content: string | null;
    source_created_at: string | null;
    type: string;
    weight: number;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT
      relations.relation_id AS relation_id,
      relations.candidate_id AS candidate_id,
      relations.episode_id AS episode_id,
      relations.source_entity_id AS source_entity_id,
      relations.target_entity_id AS target_entity_id,
      source_entities.name AS source_entity_name,
      target_entities.name AS target_entity_name,
      episodes.title AS source_title,
      episodes.content AS source_content,
      episodes.created_at AS source_created_at,
      relations.type AS type,
      relations.weight AS weight,
      relations.created_at AS created_at,
      relations.updated_at AS updated_at
    FROM relations
    LEFT JOIN entities AS source_entities ON source_entities.entity_id = relations.source_entity_id
    LEFT JOIN entities AS target_entities ON target_entities.entity_id = relations.target_entity_id
    LEFT JOIN episodes ON episodes.episode_id = relations.episode_id
    ORDER BY relations.weight DESC, relations.updated_at DESC
    LIMIT 120
  `);

  return rows.map((row) => ({
    id: row.relation_id,
    candidateId: row.candidate_id ?? undefined,
    episodeId: row.episode_id ?? undefined,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    sourceEntityName: row.source_entity_name ?? undefined,
    targetEntityName: row.target_entity_name ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    sourceContent: row.source_content ?? undefined,
    sourceCreatedAt: row.source_created_at ?? undefined,
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
  await runInTransaction(db, async () => {
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
  });
}

export async function dismissStoredMemory(db: SQLiteDatabase, memoryId: string) {
  await runInTransaction(db, async () => {
    await db.runAsync(
      "UPDATE memory_atoms SET status = 'archived', updated_at = ? WHERE memory_id = ?",
      nowIso(),
      memoryId,
    );
    if (await isFtsAvailable(db)) {
      await db.runAsync("DELETE FROM memory_atoms_fts WHERE memory_id = ?", memoryId);
    }
  });
}
