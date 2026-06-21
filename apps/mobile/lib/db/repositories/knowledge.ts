import type { SQLiteDatabase } from "expo-sqlite";

import { isFtsAvailable } from "@/lib/db/schema";
import { parseJson } from "@/lib/db/serialization";
import type { RelevantKnowledge } from "@/lib/db/types";

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2);

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

const importanceBoost = (importance?: number) =>
  typeof importance === "number" && Number.isFinite(importance)
    ? -Math.max(0, Math.min(5, importance)) * 0.04
    : 0;

const readRationale = (value: string | null) => {
  const metadata = parseJson(value);
  return typeof metadata?.rationale === "string" ? metadata.rationale : undefined;
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
    title: string | null;
    content: string;
    media_uri: string | null;
    created_at: string;
  }>(
    `
      SELECT episode_id AS id, source AS type, title, content, media_uri, created_at
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
    title: item.title ?? undefined,
    content: item.content,
    hasMedia: !!item.media_uri,
    isScreenOff: item.type === "iot",
    createdAt: item.created_at,
    rank: 2 + index * 0.05,
  }));
}

async function listEntityRelationKnowledge(
  db: SQLiteDatabase,
  tokens: string[],
  limit: number,
): Promise<RelevantKnowledge[]> {
  if (!tokens.length) return [];

  const like = tokens.map(() => "(entities.name LIKE ? OR entities.type LIKE ?)").join(" OR ");
  const relationLike = tokens
    .map(
      () =>
        "(relations.type LIKE ? OR source_entities.name LIKE ? OR target_entities.name LIKE ?)",
    )
    .join(" OR ");
  const entityParams = tokens.flatMap((token) => [`%${token}%`, `%${token}%`]);
  const relationParams = tokens.flatMap((token) => [`%${token}%`, `%${token}%`, `%${token}%`]);

  const [entityRows, relationRows] = await Promise.all([
    db.getAllAsync<{
      id: string;
      type: string;
      content: string;
      created_at: string;
    }>(
      `
        SELECT entity_id AS id, type, name AS content, created_at
        FROM entities
        WHERE ${like}
        LIMIT ?
      `,
      ...entityParams,
      limit,
    ),
    db.getAllAsync<{
      id: string;
      type: string;
      source_name: string | null;
      source_entity_id: string;
      target_name: string | null;
      target_entity_id: string;
      weight: number;
      created_at: string;
    }>(
      `
        SELECT
          relations.relation_id AS id,
          relations.type AS type,
          relations.source_entity_id AS source_entity_id,
          relations.target_entity_id AS target_entity_id,
          source_entities.name AS source_name,
          target_entities.name AS target_name,
          relations.weight AS weight,
          relations.created_at AS created_at
        FROM relations
        LEFT JOIN entities AS source_entities ON source_entities.entity_id = relations.source_entity_id
        LEFT JOIN entities AS target_entities ON target_entities.entity_id = relations.target_entity_id
        WHERE ${relationLike}
        LIMIT ?
      `,
      ...relationParams,
      limit,
    ),
  ]);

  return [
    ...entityRows.map((item) => ({
      id: item.id,
      source: "entity" as const,
      type: item.type,
      title: item.content,
      content: item.content,
      createdAt: item.created_at,
      nodeId: `entity-${item.id}`,
      rank: rankByTokenMatches(`${item.type} ${item.content}`, tokens) + 0.1,
    })),
    ...relationRows.map((item) => ({
      id: item.id,
      source: "relation" as const,
      type: item.type,
      title: item.type,
      content: `${item.source_name ?? "Unknown"} · ${item.type} · ${item.target_name ?? "Unknown"} (weight ${item.weight})`,
      createdAt: item.created_at,
      nodeId: `relation-${item.id}`,
      rank: rankByTokenMatches(
        `${item.type} ${item.source_name ?? ""} ${item.target_name ?? ""}`,
        tokens,
      ) + 0.15,
    })),
  ];
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
    const [memoryRows, episodeRows, reflectionRows, recentEpisodes, entityRows] = await Promise.all([
      db.getAllAsync<any>(
        `
          SELECT memory_atoms.memory_id AS id, memory_atoms.type AS type,
            memory_atoms.content AS content, memory_atoms.created_at AS created_at,
            memory_atoms.importance AS importance,
            memory_candidates.kind AS candidate_kind,
            memory_candidates.metadata_json AS candidate_metadata_json
          FROM memory_atoms
          LEFT JOIN memory_candidates ON memory_candidates.candidate_id = memory_atoms.candidate_id
          WHERE memory_atoms.status = 'active' AND ${like}
          LIMIT ?
        `,
        ...params,
        limit,
      ),
      db.getAllAsync<any>(
        `SELECT episode_id AS id, source AS type, title, content, media_uri, created_at FROM episodes WHERE ${episodeLike} LIMIT ?`,
        ...params,
        limit,
      ),
      db.getAllAsync<any>(
        `SELECT reflection_id AS id, 'reflection' AS type, title, content, created_at FROM reflections WHERE status = 'active' AND (title LIKE ? OR content LIKE ?) LIMIT ?`,
        `%${query}%`,
        `%${query}%`,
        limit,
      ),
      listRecentEpisodeKnowledge(db, recentEpisodeLimit),
      listEntityRelationKnowledge(db, tokens, limit),
    ]);
    return mergeRelevantKnowledge([
      ...memoryRows.map((item) => ({
        id: item.id,
        source: "memory" as const,
        type: item.candidate_kind === "open_loop" ? "open_loop" : item.type,
        content: item.content,
        importance: item.importance,
        rationale: readRationale(item.candidate_metadata_json),
        createdAt: item.created_at,
        nodeId: `memory-${item.id}`,
        rank:
          rankByTokenMatches(`${item.type} ${item.content}`, tokens) +
          (item.candidate_kind === "open_loop" ? -0.35 : 0) +
          importanceBoost(item.importance),
      })),
      ...episodeRows.map((item) => ({
        id: item.id,
        source: "episode" as const,
        type: item.type,
        title: item.title ?? undefined,
        content: item.content,
        hasMedia: !!item.media_uri,
        isScreenOff: item.type === "iot",
        createdAt: item.created_at,
        rank: rankByTokenMatches(`${item.type} ${item.content}`, tokens) + 0.2,
      })),
      ...reflectionRows.map((item) => ({
        id: item.id,
        source: "reflection" as const,
        type: item.type,
        title: item.title ?? undefined,
        content: item.content,
        createdAt: item.created_at,
        rank: rankByTokenMatches(item.content, tokens) - 0.2,
      })),
      ...entityRows,
      ...recentEpisodes,
    ], limit);
  }

  const tokens = tokenize(query);
  const recentEpisodeLimit = Math.min(3, limit);
  const [memoryRows, episodeRows, reflectionRows, recentEpisodes, entityRows] = await Promise.all([
    db.getAllAsync<any>(
      `
        SELECT memory_atoms.memory_id AS id, memory_atoms.type AS type,
          memory_atoms.content AS content, memory_atoms.created_at AS created_at,
          memory_atoms.importance AS importance,
          memory_candidates.kind AS candidate_kind,
          memory_candidates.metadata_json AS candidate_metadata_json,
          bm25(memory_atoms_fts) AS rank
        FROM memory_atoms_fts
        JOIN memory_atoms ON memory_atoms.memory_id = memory_atoms_fts.memory_id
        LEFT JOIN memory_candidates ON memory_candidates.candidate_id = memory_atoms.candidate_id
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
          episodes.title AS title,
          episodes.content AS content,
          episodes.media_uri AS media_uri,
          episodes.created_at AS created_at,
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
          reflections.title AS title,
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
    listEntityRelationKnowledge(db, tokens, limit),
  ]);

  return mergeRelevantKnowledge([
    ...memoryRows.map((item) => ({
      id: item.id,
      source: "memory" as const,
      type: item.candidate_kind === "open_loop" ? "open_loop" : item.type,
      content: item.content,
      importance: item.importance,
      rationale: readRationale(item.candidate_metadata_json),
      createdAt: item.created_at,
      nodeId: `memory-${item.id}`,
      rank:
        item.rank +
        (item.candidate_kind === "open_loop" ? -0.35 : 0) +
        importanceBoost(item.importance),
    })),
    ...episodeRows.map((item) => ({
      id: item.id,
      source: "episode" as const,
      type: item.type,
      title: item.title ?? undefined,
      content: item.content,
      hasMedia: !!item.media_uri,
      isScreenOff: item.type === "iot",
      createdAt: item.created_at,
      rank: item.rank + 0.2,
    })),
    ...reflectionRows.map((item) => ({
      id: item.id,
      source: "reflection" as const,
      type: item.type,
      title: item.title ?? undefined,
      content: item.content,
      createdAt: item.created_at,
      rank: item.rank - 0.2,
    })),
    ...entityRows,
    ...recentEpisodes,
  ], limit);
}
