import type { SQLiteDatabase } from "expo-sqlite";

import { isFtsAvailable } from "@/lib/db/schema";
import { parseJson, safeJson } from "@/lib/db/serialization";
import { runInTransaction } from "@/lib/db/transactions";
import type { Episode, EpisodeSource, JournalRecord } from "@/lib/db/types";

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export async function insertEpisodeFts(db: SQLiteDatabase, episode: Episode) {
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

export async function createEpisodeInCurrentTransaction(
  db: SQLiteDatabase,
  episode: Episode,
) {
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

  await runInTransaction(db, async () => {
    await createEpisodeInCurrentTransaction(db, episode);
  });
  return episode;
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

export async function updateJournalContent(
  db: SQLiteDatabase,
  episodeId: string,
  content: string,
) {
  const trimmed = content.trim();
  if (!trimmed) return;
  const updatedAt = nowIso();
  const episode = await db.getFirstAsync<{
    episode_id: string;
    source: EpisodeSource;
    title: string | null;
    media_uri: string | null;
    metadata_json: string | null;
    created_at: string;
  }>(
    `
      SELECT episode_id, source, title, media_uri, metadata_json, created_at
      FROM episodes
      WHERE episode_id = ?
      LIMIT 1
    `,
    episodeId,
  );
  await runInTransaction(db, async () => {
    await db.runAsync(
      `
        UPDATE episodes
        SET content = ?, updated_at = ?
        WHERE episode_id = ?
      `,
      trimmed,
      updatedAt,
      episodeId,
    );

    if (episode) {
      await insertEpisodeFts(db, {
        id: episode.episode_id,
        source: episode.source,
        title: episode.title ?? undefined,
        content: trimmed,
        mediaUri: episode.media_uri ?? undefined,
        metadata: parseJson(episode.metadata_json),
        createdAt: episode.created_at,
      });
    }
  });
}
