import type { SQLiteDatabase } from "expo-sqlite";

import { createEpisodeInCurrentTransaction } from "@/lib/db/repositories/episodes";
import { parseJson, safeJson } from "@/lib/db/serialization";
import { runInTransaction } from "@/lib/db/transactions";
import type { CandidateStatus, DeviceEventRecord, DeviceRecord, DeviceStatus } from "@/lib/db/types";

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const scopedDeviceEventId = (deviceId: string, eventId: string) =>
  eventId.startsWith(`${deviceId}:`) ? eventId : `${deviceId}:${eventId}`;
const promotableDeviceEventTypes = new Set(["capture", "button", "serial"]);
const isPromotableDeviceEvent = (eventType: string) =>
  promotableDeviceEventTypes.has(eventType.toLowerCase());
const deviceEventRationale = (event: DeviceEventRecord) => {
  const deviceName = event.deviceName ?? "a Stardust Sense device";
  return `${deviceName} captured a ${event.eventType} event that may represent an off-screen memory fragment.`;
};
const parseCapabilities = (value: string | null) => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
};

export async function listDevices(db: SQLiteDatabase): Promise<DeviceRecord[]> {
  const rows = await db.getAllAsync<{
    device_id: string;
    name: string;
    kind: string;
    status: DeviceStatus;
    last_seen_at: string | null;
    battery_level: number | null;
    firmware_version: string | null;
    protocol_version: string | null;
    capabilities_json: string | null;
    event_count: number;
    pending_review_count: number;
    reviewed_event_count: number;
    last_event_at: string | null;
  }>(`
    SELECT
      devices.device_id AS device_id,
      devices.name AS name,
      devices.kind AS kind,
      devices.status AS status,
      devices.last_seen_at AS last_seen_at,
      devices.battery_level AS battery_level,
      devices.firmware_version AS firmware_version,
      devices.protocol_version AS protocol_version,
      devices.capabilities_json AS capabilities_json,
      COUNT(device_events.device_event_id) AS event_count,
      SUM(
        CASE
          WHEN lower(device_events.event_type) IN ('capture', 'button', 'serial')
            AND (device_events.candidate_id IS NULL OR memory_candidates.status = 'pending')
          THEN 1
          ELSE 0
        END
      ) AS pending_review_count,
      SUM(
        CASE
          WHEN lower(device_events.event_type) IN ('capture', 'button', 'serial')
            AND memory_candidates.status IN ('accepted', 'dismissed')
          THEN 1
          ELSE 0
        END
      ) AS reviewed_event_count,
      MAX(device_events.created_at) AS last_event_at
    FROM devices
    LEFT JOIN device_events ON device_events.device_id = devices.device_id
    LEFT JOIN memory_candidates ON memory_candidates.candidate_id = device_events.candidate_id
    GROUP BY devices.device_id
    ORDER BY COALESCE(devices.last_seen_at, devices.updated_at) DESC
  `);
  return rows.map((row) => ({
    id: row.device_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    lastSeenAt: row.last_seen_at ?? undefined,
    batteryLevel: row.battery_level ?? undefined,
    firmwareVersion: row.firmware_version ?? undefined,
    protocolVersion: row.protocol_version ?? undefined,
    capabilities: parseCapabilities(row.capabilities_json),
    eventCount: row.event_count ?? 0,
    pendingReviewCount: row.pending_review_count ?? 0,
    reviewedEventCount: row.reviewed_event_count ?? 0,
    lastEventAt: row.last_event_at ?? undefined,
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
    protocolVersion?: string;
    capabilities?: string[];
  },
) {
  const seenAt = nowIso();
  await db.runAsync(
    `
      INSERT INTO devices (
        device_id, name, kind, status, last_seen_at, battery_level, firmware_version,
        protocol_version, capabilities_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        name = excluded.name,
        kind = COALESCE(?, devices.kind),
        status = excluded.status,
        last_seen_at = excluded.last_seen_at,
        battery_level = COALESCE(excluded.battery_level, devices.battery_level),
        firmware_version = COALESCE(excluded.firmware_version, devices.firmware_version),
        protocol_version = COALESCE(excluded.protocol_version, devices.protocol_version),
        capabilities_json = COALESCE(excluded.capabilities_json, devices.capabilities_json),
        updated_at = excluded.updated_at
    `,
    device.id,
    device.name,
    device.kind ?? "xiao-esp32s3-sense",
    device.status ?? "known",
    seenAt,
    device.batteryLevel ?? null,
    device.firmwareVersion ?? null,
    device.protocolVersion ?? null,
    device.capabilities?.length ? JSON.stringify(device.capabilities) : null,
    seenAt,
    seenAt,
    device.kind ?? null,
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
  const eventId = scopedDeviceEventId(input.deviceId, input.id ?? createId("device-event"));
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

    await createEpisodeInCurrentTransaction(db, {
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
      device_events.candidate_id AS candidate_id,
      memory_candidates.status AS candidate_status,
      device_events.created_at AS created_at
    FROM device_events
    LEFT JOIN devices ON devices.device_id = device_events.device_id
    LEFT JOIN memory_candidates ON memory_candidates.candidate_id = device_events.candidate_id
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
    promotable: isPromotableDeviceEvent(row.event_type),
    candidateId: row.candidate_id ?? undefined,
    candidateStatus: row.candidate_status ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function promoteDeviceEventToCandidate(
  db: SQLiteDatabase,
  event: DeviceEventRecord,
) {
  if (!event.promotable) {
    throw new Error("Only capture-like device events can be promoted to memory review.");
  }
  const createdAt = nowIso();
  const candidateId = `candidate-${event.id}`;
  await runInTransaction(db, async () => {
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
        deviceName: event.deviceName,
        eventId: event.id,
        eventType: event.eventType,
        eventCreatedAt: event.createdAt,
        eventMetadata: event.metadata,
        rationale: deviceEventRationale(event),
      }),
      createdAt,
      createdAt,
    );
    await db.runAsync(
      `
        UPDATE device_events
        SET candidate_id = ?
        WHERE device_event_id = ? AND device_id = ?
      `,
      candidateId,
      event.id,
      event.deviceId,
    );
  });
  return candidateId;
}
