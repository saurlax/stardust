import type { SQLiteDatabase } from "expo-sqlite";

import {
  clearDeviceNetworkCaptureUrl,
  createDeviceEvent,
  createDevicePhotoEvent,
  upsertDevice,
  type DeviceRecord,
} from "@/lib/db";

type HttpDeviceStatus = {
  battery?: number | null;
  firmware?: string;
  protocolVersion?: string;
  cameraReady?: boolean;
  storage?: { state?: string };
  network?: {
    baseUrl?: string;
    captureUrl?: string;
    eventsUrl?: string;
    manifestUrl?: string;
    staticBaseUrl?: string;
  };
};

type HttpDeviceManifest = {
  protocolVersion?: string;
  deviceKind?: string;
  capabilities?: unknown[];
};

type HttpDeviceEvent = {
  id?: string;
  type?: string;
  content?: string;
  ts?: string;
  metadata?: Record<string, unknown>;
};

type SyncStardustDeviceHttpOptions = {
  syncEvents?: boolean;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const withHttpScheme = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `http://${value.replace(/^\/+/, "")}`;

export const getDeviceBaseUrl = (device: DeviceRecord) => {
  const url = device.networkCaptureUrl;
  if (!url) return undefined;
  return trimTrailingSlash(withHttpScheme(url).replace(/\/capture(?:\.jpg)?(?:\?.*)?$/, ""));
};

const resolveDeviceUrl = (baseUrl: string, path?: string) => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${trimTrailingSlash(withHttpScheme(baseUrl))}${path.startsWith("/") ? path : `/${path}`}`;
};

const withTimeout = (ms: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const requestUrl = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const { controller, timeout } = withTimeout(8000);
  try {
    const response = await fetch(requestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Device HTTP request failed: ${response.status}`);
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Device HTTP request failed")) {
      throw error;
    }
    throw new Error(
      `Cannot reach Stardust Sense at ${url}. Make sure the phone and device are on the same Wi-Fi, the device IP is still valid, and this app build allows local HTTP.`,
    );
  } finally {
    clearTimeout(timeout);
  }
};

const eventMediaUrl = (baseUrl: string, event: HttpDeviceEvent) => {
  const value =
    typeof event.metadata?.mediaUrl === "string"
      ? event.metadata.mediaUrl
      : typeof event.metadata?.staticPath === "string"
        ? event.metadata.staticPath
        : undefined;
  return resolveDeviceUrl(baseUrl, value);
};

const cacheBustUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
const eventMillis = (event: HttpDeviceEvent) => {
  const value = Number(event.ts);
  return Number.isFinite(value) ? value : undefined;
};

const createHttpDeviceEvent = async (
  db: SQLiteDatabase,
  device: DeviceRecord,
  baseUrl: string,
  event: HttpDeviceEvent,
  createdAt = new Date().toISOString(),
): Promise<string | undefined> => {
  const mediaUrl = eventMediaUrl(baseUrl, event);
  const input = {
    id: event.id,
    deviceId: device.id,
    content: event.content ?? "Device event",
    metadata: {
      ...(event.metadata ?? {}),
      source: typeof event.metadata?.source === "string" ? event.metadata.source : "wifi-http",
      deviceTimestamp: event.ts,
    },
    createdAt,
  };

  if (mediaUrl) {
    const displayMediaUrl = cacheBustUrl(mediaUrl);
    await createDevicePhotoEvent(db, {
      ...input,
      mediaUri: displayMediaUrl,
    });
    return displayMediaUrl;
  }

  await createDeviceEvent(db, {
    ...input,
    eventType: event.type ?? "capture",
  });
  return undefined;
};

export const syncStardustDeviceHttp = async (
  db: SQLiteDatabase,
  device: DeviceRecord,
  options: SyncStardustDeviceHttpOptions = {},
) => {
  const baseUrl = getDeviceBaseUrl(device);
  if (!baseUrl) return;

  const shouldSyncEvents = options.syncEvents ?? true;
  const [status, manifest, events] = await Promise.all([
    fetchJson<HttpDeviceStatus>(`${baseUrl}/status`).catch(() => undefined),
    fetchJson<HttpDeviceManifest>(`${baseUrl}/manifest`).catch(() => undefined),
    shouldSyncEvents
      ? fetchJson<HttpDeviceEvent[]>(`${baseUrl}/events`).catch(() => [])
      : Promise.resolve([]),
  ]);

  const captureUrl =
    status?.network?.captureUrl ??
    resolveDeviceUrl(baseUrl, "/capture") ??
    device.networkCaptureUrl;
  const capabilities = Array.isArray(manifest?.capabilities)
    ? manifest.capabilities.filter((item): item is string => typeof item === "string")
    : undefined;

  await upsertDevice(db, {
    id: device.id,
    name: device.name,
    kind: manifest?.deviceKind,
    status: "connected",
    batteryLevel: typeof status?.battery === "number" ? status.battery : undefined,
    firmwareVersion: status?.firmware,
    protocolVersion: manifest?.protocolVersion ?? status?.protocolVersion,
    networkCaptureUrl: captureUrl,
    capabilities,
  });

  const syncedAt = Date.now();
  const latestEventMillis = events.reduce<number | undefined>((latest, event) => {
    const current = eventMillis(event);
    if (current === undefined) return latest;
    return latest === undefined ? current : Math.max(latest, current);
  }, undefined);

  for (const event of events) {
    const currentEventMillis = eventMillis(event);
    const createdAt =
      latestEventMillis === undefined || currentEventMillis === undefined
        ? undefined
        : new Date(syncedAt - Math.max(0, latestEventMillis - currentEventMillis)).toISOString();
    await createHttpDeviceEvent(db, device, baseUrl, event, createdAt).catch(() => undefined);
  }
};

export const captureStardustDeviceHttp = async (
  db: SQLiteDatabase,
  device: DeviceRecord,
) => {
  const baseUrl = getDeviceBaseUrl(device);
  if (!baseUrl) throw new Error("Configure Wi-Fi before capturing.");
  const event = await fetchJson<HttpDeviceEvent>(`${baseUrl}/capture`);
  const mediaUrl = await createHttpDeviceEvent(db, device, baseUrl, event);
  await syncStardustDeviceHttp(db, device, { syncEvents: false }).catch(() => undefined);
  return mediaUrl;
};

export const resetStardustDeviceWifiHttp = async (db: SQLiteDatabase, device: DeviceRecord) => {
  const baseUrl = getDeviceBaseUrl(device);
  if (!baseUrl) throw new Error("Configure Wi-Fi before resetting it.");
  await fetchJson(`${baseUrl}/wifi/reset`);
  await clearDeviceNetworkCaptureUrl(db, device.id);
};
