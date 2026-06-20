import type { SQLiteDatabase } from "expo-sqlite";

export const DATABASE_VERSION = 12;

let ftsAvailable: boolean | undefined;

export async function isFtsAvailable(db: SQLiteDatabase) {
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
      memory_context_json TEXT,
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
      episode_id TEXT,
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
