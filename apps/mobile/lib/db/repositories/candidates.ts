import type { SQLiteDatabase } from "expo-sqlite";

import type { MessageToolCard, ToolCardType } from "@/lib/chat/types";
import { insertMemoryFts, insertReflectionFts } from "@/lib/db/fts";
import { createEpisodeInCurrentTransaction } from "@/lib/db/repositories/episodes";
import { parseJson, parseToolCards, safeJson, serializeToolCards } from "@/lib/db/serialization";
import { runInTransaction } from "@/lib/db/transactions";
import type { CandidateKind, CandidateStatus, MemoryCandidate } from "@/lib/db/types";
import { createTaskCalendarEvent, parseTaskDueAt } from "@/lib/taskCalendar";

const SELF_ENTITY_ID = "entity-self";
const nowIso = () => new Date().toISOString();
const normalizeImportance = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(5, Math.round(value)))
    : fallback;
const createEntityId = (type: string, name: string, fallbackId: string) =>
  `entity-${type}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-+|-+$/g, "") || fallbackId}`;
const isTaskCandidate = (candidate: MemoryCandidate) =>
  candidate.kind === "open_loop" || candidate.type === "task" || candidate.type === "goal";

async function upsertEntity(
  db: SQLiteDatabase,
  {
    id,
    name,
    type,
    updatedAt,
  }: {
    id: string;
    name: string;
    type: string;
    updatedAt: string;
  },
) {
  await db.runAsync(
    `
      INSERT INTO entities (entity_id, name, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name, type) DO UPDATE SET updated_at = excluded.updated_at
    `,
    id,
    name,
    type,
    updatedAt,
    updatedAt,
  );
  const row = await db.getFirstAsync<{ entity_id: string }>(
    "SELECT entity_id FROM entities WHERE name = ? AND type = ? LIMIT 1",
    name,
    type,
  );
  return row?.entity_id ?? id;
}

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
    rationale:
      typeof candidate.metadata?.rationale === "string"
        ? candidate.metadata.rationale
        : undefined,
    importance:
      typeof candidate.metadata?.importance === "number"
        ? normalizeImportance(candidate.metadata.importance, 3)
        : undefined,
    dueAt: typeof candidate.metadata?.dueAt === "string" ? candidate.metadata.dueAt : undefined,
    dueEndAt: typeof candidate.metadata?.dueEndAt === "string" ? candidate.metadata.dueEndAt : undefined,
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
  const nextMetadata = { ...(candidate.metadata ?? {}) };

  if (status === "accepted" && candidate.status !== "accepted" && isTaskCandidate(candidate)) {
    const taskDue = parseTaskDueAt(nextMetadata);
    if (taskDue && typeof nextMetadata.calendarEventId !== "string") {
      try {
        nextMetadata.calendarEventId = await createTaskCalendarEvent({
          title: candidate.title || content,
          content,
          dueAt: taskDue.dueAt,
          dueEndAt: taskDue.dueEndAt,
        });
        delete nextMetadata.calendarSyncError;
      } catch (error) {
        nextMetadata.calendarSyncError = error instanceof Error ? error.message : "Calendar sync failed.";
      }
    }
  }

  await runInTransaction(db, async () => {
    await db.runAsync(
      `
        UPDATE memory_candidates
        SET status = ?, content = ?, metadata_json = ?, updated_at = ?
        WHERE candidate_id = ?
      `,
      status,
      content,
      safeJson(nextMetadata),
      updatedAt,
      candidateId,
    );
    await syncCandidateToolCardSnapshot(db, candidate, status, content, updatedAt);

    if (status !== "accepted") return;
    if (candidate.status === "accepted") return;

    if (candidate.kind === "memory" || candidate.kind === "open_loop") {
      const type = candidate.kind === "open_loop" ? "concern" : candidate.type || "memory";
      const importance = normalizeImportance(
        nextMetadata.importance,
        candidate.kind === "open_loop" ? 4 : 3,
      );
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
        importance,
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
      await createEpisodeInCurrentTransaction(db, {
        id: `episode-${candidateId}`,
        source: "journal",
        title: candidate.title,
        content,
        metadata: {
          candidateId,
          rationale:
            typeof candidate.metadata?.rationale === "string"
              ? candidate.metadata.rationale
              : undefined,
        },
        createdAt: updatedAt,
      });
    }

    if (candidate.kind === "reflection") {
      await db.runAsync(
        `
          INSERT OR REPLACE INTO reflections (
            reflection_id, candidate_id, episode_id, title, content, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        `,
        `reflection-${candidateId}`,
        candidateId,
        candidate.episodeId ?? null,
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
      const selfEntityId = await upsertEntity(db, {
        id: SELF_ENTITY_ID,
        name: "you",
        type: "person",
        updatedAt,
      });
      const resolvedEntityId = await upsertEntity(db, {
        id: entityId,
        name: entityName,
        type: entityType,
        updatedAt,
      });
      await db.runAsync(
        `
          INSERT INTO relations (
            relation_id, candidate_id, episode_id, source_entity_id, target_entity_id, type,
            weight, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(relation_id) DO UPDATE SET
            weight = relations.weight + 1,
            candidate_id = COALESCE(relations.candidate_id, excluded.candidate_id),
            episode_id = COALESCE(relations.episode_id, excluded.episode_id),
            updated_at = excluded.updated_at
        `,
        `relation-${selfEntityId}-${resolvedEntityId}`,
        candidateId,
        candidate.episodeId ?? null,
        selfEntityId,
        resolvedEntityId,
        "noticed",
        updatedAt,
        updatedAt,
      );

      if (relationTarget && relationTarget.toLowerCase() !== entityName.toLowerCase()) {
        const targetEntityId = createEntityId(relationTargetType, relationTarget, candidateId);
        const resolvedTargetEntityId = await upsertEntity(db, {
          id: targetEntityId,
          name: relationTarget,
          type: relationTargetType,
          updatedAt,
        });
        await db.runAsync(
          `
            INSERT INTO relations (
              relation_id, candidate_id, episode_id, source_entity_id, target_entity_id, type,
              weight, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(relation_id) DO UPDATE SET
              weight = relations.weight + 1,
              candidate_id = COALESCE(relations.candidate_id, excluded.candidate_id),
              episode_id = COALESCE(relations.episode_id, excluded.episode_id),
              updated_at = excluded.updated_at
          `,
          `relation-${resolvedEntityId}-${resolvedTargetEntityId}-${relationType.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-") || "related"}`,
          candidateId,
          candidate.episodeId ?? null,
          resolvedEntityId,
          resolvedTargetEntityId,
          relationType,
          updatedAt,
          updatedAt,
        );
      }
    }
  });
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

export const toToolCardsFromCandidates = (candidates: MemoryCandidate[]) =>
  candidates.map(candidateToToolCard);
