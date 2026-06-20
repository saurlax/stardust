import type { SQLiteDatabase } from "expo-sqlite";

import { createEpisode } from "@/lib/db/repositories/episodes";
import { parseJson, safeJson } from "@/lib/db/serialization";
import { runInTransaction } from "@/lib/db/transactions";
import type { CandidateStatus, DeviceEventRecord, DeviceRecord, DeviceStatus } from "@/lib/db/types";

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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
    device_name: string | null;
    event_type: string;
    content: string;
    metadata_json: string | null;
    candidate_id: string | null;
    candidate_status: CandidateStatus | null;
    created_at: string;
  }>(`
    SELECT
      device_events.device_event_id AS device_event_id,
      device_events.device_id AS device_id,
      devices.name AS device_name,
      device_events.event_type AS event_type,
      device_events.content AS content,
      device_events.metadata_json AS metadata_json,
      memory_candidates.candidate_id AS candidate_id,
      memory_candidates.status AS candidate_status,
      device_events.created_at AS created_at
    FROM device_events
    LEFT JOIN devices ON devices.device_id = device_events.device_id
    LEFT JOIN memory_candidates ON memory_candidates.candidate_id = 'candidate-' || device_events.device_event_id
    ORDER BY device_events.created_at DESC
    LIMIT 80
  `);
  return rows.map((row) => ({
    id: row.device_event_id,
    deviceId: row.device_id,
    deviceName: row.device_name ?? undefined,
    eventType: row.event_type,
    content: row.content,
    metadata: parseJson(row.metadata_json),
    candidateId: row.candidate_id ?? undefined,
    candidateStatus: row.candidate_status ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function promoteDeviceEventToCandidate(
  db: SQLiteDatabase,
  event: DeviceEventRecord,
) {
  const createdAt = nowIso();
  const candidateId = `candidate-${event.id}`;
  await db.runAsync(
    `
      INSERT OR IGNORE INTO memory_candidates (
        candidate_id, episode_id, kind, type, title, content, status,
        metadata_json, created_at, updated_at
      )
      VALUES (?, ?, 'memory', 'memory', ?, ?, 'pending', ?, ?, ?)
    `,
    candidateId,
    `episode-${event.id}`,
    event.deviceName ? `${event.eventType} · ${event.deviceName}` : event.eventType,
    event.content,
    safeJson({
      toolType: "save_memory",
      source: "device_event",
      deviceId: event.deviceId,
      eventId: event.id,
      eventType: event.eventType,
    }),
    createdAt,
    createdAt,
  );
}
