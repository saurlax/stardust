import { PermissionsAndroid, Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  createDeviceEvent,
  createDevicePhotoEvent,
  listDevices,
  updateDeviceStatus,
  upsertDevice,
} from "@/lib/db";

const STARDUST_DEVICE_NAME = "Stardust Sense";
const SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
const STATUS_CHARACTERISTIC_UUID = "7b3f4a11-9d62-4a7d-a0d9-2ffb9239c4d1";
const EVENT_CHARACTERISTIC_UUID = "7b3f4a12-9d62-4a7d-a0d9-2ffb9239c4d1";
const COMMAND_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";
const MANIFEST_CHARACTERISTIC_UUID = "7b3f4a14-9d62-4a7d-a0d9-2ffb9239c4d1";
const PHOTO_CHARACTERISTIC_UUID = "7b3f4a15-9d62-4a7d-a0d9-2ffb9239c4d1";

type BlePlxModule = typeof import("react-native-ble-plx");
type BleManagerInstance = InstanceType<BlePlxModule["BleManager"]>;
type DeviceInstance = Awaited<ReturnType<BleManagerInstance["connectToDevice"]>>;
type Subscription = { remove: () => void };
export type StardustBleStatus =
  | "poweredOn"
  | "poweredOff"
  | "unsupported"
  | "unauthorized"
  | "unavailable";
type BleState = Awaited<ReturnType<BleManagerInstance["state"]>>;
type StardustDeviceCommand = "capture" | "sync" | "sleep";

let manager: BleManagerInstance | null = null;
const connectedDevices = new Map<string, DeviceInstance>();
const disconnectSubscriptions = new Map<string, Subscription>();
const eventSubscriptions = new Map<string, Subscription>();
const photoSubscriptions = new Map<string, Subscription>();

type PhotoTransfer = {
  photoId: string;
  mimeType: string;
  expectedBytes: number;
  expectedChunks: number;
  width?: number;
  height?: number;
  chunks: string[];
  receivedBytes: number;
  receivedChunks: number;
};

const activePhotoTransfers = new Map<string, PhotoTransfer>();

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const utf8Encode = (value: string) => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
};

const utf8Decode = (bytes: number[]) => {
  let result = "";
  for (let index = 0; index < bytes.length; ) {
    const byte1 = bytes[index++] ?? 0;
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
      continue;
    }

    if (byte1 < 0xe0) {
      const byte2 = bytes[index++] ?? 0;
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
      continue;
    }

    if (byte1 < 0xf0) {
      const byte2 = bytes[index++] ?? 0;
      const byte3 = bytes[index++] ?? 0;
      result += String.fromCharCode(
        ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f),
      );
      continue;
    }

    const byte2 = bytes[index++] ?? 0;
    const byte3 = bytes[index++] ?? 0;
    const byte4 = bytes[index++] ?? 0;
    const codePoint =
      ((byte1 & 0x07) << 18) |
      ((byte2 & 0x3f) << 12) |
      ((byte3 & 0x3f) << 6) |
      (byte4 & 0x3f);
    const adjusted = codePoint - 0x10000;
    result += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
  }
  return result;
};

const encodeBase64 = (value: string) => {
  const bytes = utf8Encode(value);
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index] ?? 0;
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3;
    result += chars[(chunk >> 18) & 63];
    result += chars[(chunk >> 12) & 63];
    result += index + 1 < bytes.length ? chars[(chunk >> 6) & 63] : "=";
    result += index + 2 < bytes.length ? chars[chunk & 63] : "=";
  }
  return result;
};

const decodeBase64 = (value: string) => {
  const clean = value.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = chars.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return utf8Decode(bytes);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const base64ByteLength = (value: string) => {
  const clean = value.replace(/\s/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
};

const ensureBlePermissions = async () => {
  if (Platform.OS !== "android") return;
  if (Platform.Version < 31) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Location permission is required to scan BLE devices on this Android version.");
    }
    return;
  }

  const permissions = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.some((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied) {
    throw new Error("Bluetooth permissions are required to connect Stardust Sense.");
  }
};

const getBleManager = async () => {
  if (Platform.OS === "web") {
    throw new Error("BLE requires a native development build.");
  }
  if (manager) return manager;

  await ensureBlePermissions();
  try {
    const { BleManager } = await import("react-native-ble-plx");
    manager = new BleManager();
    return manager;
  } catch {
    throw new Error("BLE is unavailable. Build a custom dev client with react-native-ble-plx.");
  }
};

const mapBleState = (state: BleState): StardustBleStatus => {
  switch (state) {
    case "PoweredOn":
      return "poweredOn";
    case "PoweredOff":
      return "poweredOff";
    case "Unsupported":
      return "unsupported";
    case "Unauthorized":
      return "unauthorized";
    default:
      return "unavailable";
  }
};

export const getStardustBleStatus = async (): Promise<StardustBleStatus> => {
  if (Platform.OS === "web") return "unsupported";

  try {
    const ble = await getBleManager();
    return mapBleState(await ble.state());
  } catch {
    return "unavailable";
  }
};

export const watchStardustBleStatus = async (
  listener: (status: StardustBleStatus) => void,
): Promise<{ remove: () => void }> => {
  if (Platform.OS === "web") {
    listener("unsupported");
    return { remove: () => undefined };
  }

  try {
    const ble = await getBleManager();
    const subscription = ble.onStateChange((state) => listener(mapBleState(state)), true);
    return { remove: () => subscription.remove() };
  } catch {
    listener("unavailable");
    return { remove: () => undefined };
  }
};

const normalizeEventTimestamp = (value?: string) => {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
};

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const scopedDeviceEventId = (deviceId: string, eventId?: string, fallbackValue?: string) =>
  eventId
    ? eventId
    : fallbackValue
      ? `event-${stableHash(fallbackValue)}`
      : undefined;

const manifestEventId = (deviceId: string, manifestValue: string, manifest: Record<string, unknown>) => {
  const bootId = typeof manifest.bootId === "string" ? manifest.bootId : undefined;
  const eventCount =
    typeof manifest.eventCount === "number" && Number.isFinite(manifest.eventCount)
      ? String(manifest.eventCount)
      : undefined;
  return bootId && eventCount
    ? `manifest-${deviceId}-${bootId}-${eventCount}`
    : `manifest-${deviceId}-${stableHash(manifestValue)}`;
};
const readCapabilities = (value: Record<string, unknown>) =>
  Array.isArray(value.capabilities)
    ? value.capabilities.filter((item): item is string => typeof item === "string")
    : undefined;
const readDeviceKind = (value: Record<string, unknown>) =>
  typeof value.deviceKind === "string" && value.deviceKind.trim()
    ? value.deviceKind.trim()
    : undefined;
const readNetworkCaptureUrl = (value: Record<string, unknown>) => {
  const directMedia = value.media;
  if (directMedia && typeof directMedia === "object" && !Array.isArray(directMedia)) {
    const captureUrl = (directMedia as Record<string, unknown>).captureUrl;
    if (typeof captureUrl === "string" && captureUrl.trim()) return captureUrl.trim();
  }

  const network = value.network;
  if (network && typeof network === "object" && !Array.isArray(network)) {
    const captureUrl = (network as Record<string, unknown>).captureUrl;
    if (typeof captureUrl === "string" && captureUrl.trim()) return captureUrl.trim();
  }

  return undefined;
};
const commandCapabilities: Record<StardustDeviceCommand, string> = {
  capture: "command-capture",
  sync: "command-sync",
  sleep: "command-sleep",
};
const createCommandAuditEvent = (
  db: SQLiteDatabase,
  deviceId: string,
  command: StardustDeviceCommand,
  status: "sent" | "failed",
  error?: unknown,
) =>
  createDeviceEvent(db, {
    deviceId,
    eventType: "command",
    content:
      status === "sent"
        ? `Stardust Sense ${command} command sent`
        : `Stardust Sense ${command} command failed`,
    metadata: {
      command,
      status,
      source: "mobile_ble",
      error: error instanceof Error ? error.message : undefined,
    },
  });
const createConnectionAuditEvent = (
  db: SQLiteDatabase,
  deviceId: string,
  status: "disconnected" | "restore_failed" | "restored",
  error?: unknown,
) => {
  const minuteBucket = Math.floor(Date.now() / 60000);
  return createDeviceEvent(db, {
    id: `connection-${deviceId}-${status}-${minuteBucket}`,
    deviceId,
    eventType: "connection",
    content: `Stardust Sense connection ${status.replace("_", " ")}`,
    metadata: {
      status,
      source: "mobile_ble",
      error: error instanceof Error ? error.message : undefined,
    },
  });
};
const createEventStreamDeviceEvent = (
  db: SQLiteDatabase,
  deviceId: string,
  encodedValue: string,
) => {
  const event = JSON.parse(decodeBase64(encodedValue)) as {
    id?: string;
    type?: string;
    content?: string;
    ts?: string;
    metadata?: Record<string, unknown>;
  };
  return createDeviceEvent(db, {
    id: scopedDeviceEventId(deviceId, event.id, encodedValue),
    deviceId,
    eventType: event.type ?? "capture",
    content: event.content ?? "Screen-off capture",
    metadata: {
      ...(event.metadata ?? {}),
      deviceTimestamp: event.ts,
    },
    createdAt: normalizeEventTimestamp(event.ts),
  });
};
const updateNetworkFromEvent = async (
  db: SQLiteDatabase,
  deviceId: string,
  event: { type?: string; metadata?: Record<string, unknown> },
) => {
  if (event.type !== "wifi") return;
  const captureUrl =
    typeof event.metadata?.captureUrl === "string" && event.metadata.captureUrl.trim()
      ? event.metadata.captureUrl.trim()
      : undefined;
  if (!captureUrl) return;
  const device = (await listDevices(db)).find((item) => item.id === deviceId);
  await upsertDevice(db, {
    id: deviceId,
    name: device?.name ?? STARDUST_DEVICE_NAME,
    kind: device?.kind,
    status: "connected",
    networkCaptureUrl: captureUrl,
  });
};
const readEventStreamPayload = (encodedValue: string) =>
  JSON.parse(decodeBase64(encodedValue)) as {
    id?: string;
    type?: string;
    content?: string;
    ts?: string;
    metadata?: Record<string, unknown>;
  };
const readPhotoTransfer = (
  metadata?: Record<string, unknown>,
): Omit<PhotoTransfer, "chunks" | "receivedBytes" | "receivedChunks"> | undefined => {
  const compactPhoto = metadata?.p;
  if (compactPhoto && typeof compactPhoto === "object" && !Array.isArray(compactPhoto)) {
    const value = compactPhoto as Record<string, unknown>;
    if (
      typeof value.id === "string" &&
      value.id.trim() &&
      typeof value.n === "number" &&
      Number.isFinite(value.n) &&
      typeof value.c === "number" &&
      Number.isFinite(value.c)
    ) {
      return {
        photoId: value.id,
        mimeType: "image/jpeg",
        expectedBytes: value.n,
        expectedChunks: value.c,
        width: typeof value.w === "number" && Number.isFinite(value.w) ? value.w : undefined,
        height: typeof value.h === "number" && Number.isFinite(value.h) ? value.h : undefined,
      };
    }
  }

  const photo = metadata?.photo;
  if (!photo || typeof photo !== "object" || Array.isArray(photo)) return undefined;
  const value = photo as Record<string, unknown>;
  if (value.transfer !== "ble") return undefined;
  if (typeof value.id !== "string" || !value.id.trim()) return undefined;
  if (typeof value.byteLength !== "number" || !Number.isFinite(value.byteLength)) return undefined;
  if (typeof value.chunkCount !== "number" || !Number.isFinite(value.chunkCount)) return undefined;

  return {
    photoId: value.id,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "image/jpeg",
    expectedBytes: value.byteLength,
    expectedChunks: value.chunkCount,
    width: typeof value.width === "number" && Number.isFinite(value.width) ? value.width : undefined,
    height: typeof value.height === "number" && Number.isFinite(value.height) ? value.height : undefined,
  };
};

const startPhotoTransferFromEvent = (deviceId: string, encodedValue: string) => {
  const event = JSON.parse(decodeBase64(encodedValue)) as {
    metadata?: Record<string, unknown>;
  };
  const transfer = readPhotoTransfer(event.metadata);
  if (!transfer) return;
  activePhotoTransfers.set(deviceId, {
    ...transfer,
    chunks: [],
    receivedBytes: 0,
    receivedChunks: 0,
  });
};

const createCompletedPhotoEvent = async (
  db: SQLiteDatabase,
  deviceId: string,
  transfer: PhotoTransfer,
) => {
  const mediaUri = `data:${transfer.mimeType};base64,${transfer.chunks.join("")}`;
  await createDevicePhotoEvent(db, {
    id: `${transfer.photoId}-image`,
    deviceId,
    content: "Photo captured by Stardust Sense",
    mediaUri,
    metadata: {
      source: "ble-photo",
      photoId: transfer.photoId,
      mimeType: transfer.mimeType,
      byteLength: transfer.receivedBytes,
      expectedBytes: transfer.expectedBytes,
      chunkCount: transfer.receivedChunks,
      expectedChunks: transfer.expectedChunks,
      width: transfer.width,
      height: transfer.height,
    },
  });
};

const appendPhotoChunk = async (
  db: SQLiteDatabase,
  deviceId: string,
  encodedChunk: string,
) => {
  const transfer = activePhotoTransfers.get(deviceId);
  if (!transfer) return;

  transfer.chunks.push(encodedChunk);
  transfer.receivedChunks += 1;
  transfer.receivedBytes += base64ByteLength(encodedChunk);

  if (
    transfer.receivedChunks >= transfer.expectedChunks ||
    transfer.receivedBytes >= transfer.expectedBytes
  ) {
    activePhotoTransfers.delete(deviceId);
    await createCompletedPhotoEvent(db, deviceId, transfer);
  }
};
const handleEventStreamValue = async (
  db: SQLiteDatabase,
  deviceId: string,
  encodedValue: string,
) => {
  const event = readEventStreamPayload(encodedValue);
  if (event.type === "photo-chunk") {
    const chunkPhotoId = typeof event.metadata?.p === "string" ? event.metadata.p : undefined;
    const transfer = activePhotoTransfers.get(deviceId);
    if (!event.content || !transfer || (chunkPhotoId && chunkPhotoId !== transfer.photoId)) return;
    await appendPhotoChunk(db, deviceId, event.content);
    return;
  }

  startPhotoTransferFromEvent(deviceId, encodedValue);
  await updateNetworkFromEvent(db, deviceId, event);
  await createEventStreamDeviceEvent(db, deviceId, encodedValue);
};
const ensureDeviceCommandCapability = async (
  db: SQLiteDatabase,
  deviceId: string,
  command: StardustDeviceCommand,
) => {
  const device = (await listDevices(db)).find((item) => item.id === deviceId);
  const capabilities = device?.capabilities;
  if (!capabilities?.length) return;
  const requiredCapability = commandCapabilities[command];
  if (!capabilities.includes(requiredCapability)) {
    throw new Error(`Stardust Sense does not advertise ${requiredCapability}.`);
  }
};

export const scanStardustDevices = async (db: SQLiteDatabase) => {
  const ble = await getBleManager();
  const found = new Map<string, { id: string; name: string }>();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ble.stopDeviceScan();
      resolve();
    }, 6500);

    ble.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        clearTimeout(timeout);
        ble.stopDeviceScan();
        reject(error);
        return;
      }

      const name = device?.name || device?.localName;
      if (!device || !name?.includes(STARDUST_DEVICE_NAME)) return;
      found.set(device.id, { id: device.id, name });
      void upsertDevice(db, {
        id: device.id,
        name,
        status: "known",
      });
    });
  });

  return [...found.values()];
};

const activateStardustDevice = async (
  db: SQLiteDatabase,
  ble: BleManagerInstance,
  readyDevice: DeviceInstance,
  options: { syncAfterActivate?: boolean } = {},
) => {
  disconnectSubscriptions.get(readyDevice.id)?.remove();
  disconnectSubscriptions.set(readyDevice.id, ble.onDeviceDisconnected(readyDevice.id, () => {
    connectedDevices.delete(readyDevice.id);
    eventSubscriptions.get(readyDevice.id)?.remove();
    eventSubscriptions.delete(readyDevice.id);
    photoSubscriptions.get(readyDevice.id)?.remove();
    photoSubscriptions.delete(readyDevice.id);
    activePhotoTransfers.delete(readyDevice.id);
    disconnectSubscriptions.get(readyDevice.id)?.remove();
    disconnectSubscriptions.delete(readyDevice.id);
    void updateDeviceStatus(db, readyDevice.id, "disconnected");
    void createConnectionAuditEvent(db, readyDevice.id, "disconnected");
  }));
  connectedDevices.set(readyDevice.id, readyDevice);
  if (Platform.OS === "android" && "requestMTU" in readyDevice) {
    await readyDevice.requestMTU(247).catch(() => undefined);
  }
  await upsertDevice(db, {
    id: readyDevice.id,
    name: readyDevice.name ?? STARDUST_DEVICE_NAME,
    status: "connected",
  });

  const status = await readyDevice.readCharacteristicForService(
    SERVICE_UUID,
    STATUS_CHARACTERISTIC_UUID,
  );
  if (status.value) {
    try {
      const parsed = JSON.parse(decodeBase64(status.value)) as {
        battery?: number;
        deviceKind?: string;
        firmware?: string;
        protocolVersion?: string;
        capabilities?: unknown[];
      };
      await upsertDevice(db, {
        id: readyDevice.id,
        name: readyDevice.name ?? STARDUST_DEVICE_NAME,
        kind: readDeviceKind(parsed),
        status: "connected",
        batteryLevel: parsed.battery,
        firmwareVersion: parsed.firmware,
        protocolVersion: parsed.protocolVersion,
        networkCaptureUrl: readNetworkCaptureUrl(parsed),
        capabilities: readCapabilities(parsed),
      });
    } catch {
      // Ignore malformed status payloads.
    }
  }

  const manifest = await readyDevice
    .readCharacteristicForService(SERVICE_UUID, MANIFEST_CHARACTERISTIC_UUID)
    .catch(() => null);
  if (manifest?.value) {
    try {
      const parsed = JSON.parse(decodeBase64(manifest.value)) as Record<string, unknown>;
      await upsertDevice(db, {
        id: readyDevice.id,
        name: readyDevice.name ?? STARDUST_DEVICE_NAME,
        kind: readDeviceKind(parsed),
        status: "connected",
        protocolVersion:
          typeof parsed.protocolVersion === "string" ? parsed.protocolVersion : undefined,
        networkCaptureUrl: readNetworkCaptureUrl(parsed),
        capabilities: readCapabilities(parsed),
      });
      await createDeviceEvent(db, {
        id: manifestEventId(readyDevice.id, manifest.value, parsed),
        deviceId: readyDevice.id,
        eventType: "manifest",
        content: "Stardust Sense manifest synchronized",
        metadata: parsed,
      });
    } catch {
      // Ignore malformed manifests.
    }
  }

  const currentEvent = await readyDevice
    .readCharacteristicForService(SERVICE_UUID, EVENT_CHARACTERISTIC_UUID)
    .catch(() => null);
  if (currentEvent?.value) {
    try {
      await handleEventStreamValue(db, readyDevice.id, currentEvent.value);
    } catch {
      // Ignore malformed current event payloads.
    }
  }

  eventSubscriptions.get(readyDevice.id)?.remove();
  eventSubscriptions.set(
    readyDevice.id,
    readyDevice.monitorCharacteristicForService(
      SERVICE_UUID,
      EVENT_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        try {
          void handleEventStreamValue(db, readyDevice.id, characteristic.value);
        } catch {
          // Ignore malformed event payloads.
        }
      },
    ),
  );
  photoSubscriptions.get(readyDevice.id)?.remove();
  photoSubscriptions.set(
    readyDevice.id,
    readyDevice.monitorCharacteristicForService(
      SERVICE_UUID,
      PHOTO_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        void appendPhotoChunk(db, readyDevice.id, characteristic.value).catch(() => undefined);
      },
    ),
  );

  if (options.syncAfterActivate ?? true) {
    await readyDevice.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      COMMAND_CHARACTERISTIC_UUID,
      encodeBase64(JSON.stringify({ type: "sync" })),
    );
  }
};

export const subscribeToStardustDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  const device = connectedDevices.get(deviceId) ?? (await ble.connectToDevice(deviceId, { timeout: 10000 }));
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
  await activateStardustDevice(db, ble, readyDevice);
};

export const restoreStardustDeviceSubscriptions = async (db: SQLiteDatabase) => {
  const devices = await listDevices(db);
  const connected = devices.filter(
    (device) => device.status === "connected" && !connectedDevices.has(device.id),
  );
  await Promise.allSettled(
    connected.map(async (device) => {
      try {
        await subscribeToStardustDevice(db, device.id);
        await createConnectionAuditEvent(db, device.id, "restored");
      } catch (error) {
        await updateDeviceStatus(db, device.id, "disconnected");
        await createConnectionAuditEvent(db, device.id, "restore_failed", error);
      }
    }),
  );
};

export const sendStardustDeviceCommand = async (
  db: SQLiteDatabase,
  deviceId: string,
  command: StardustDeviceCommand,
) => {
  try {
    const ble = await getBleManager();
    const device = connectedDevices.get(deviceId) ?? (await ble.connectToDevice(deviceId, { timeout: 10000 }));
    const readyDevice = await device.discoverAllServicesAndCharacteristics();
    await activateStardustDevice(db, ble, readyDevice, { syncAfterActivate: false });
    await wait(350);
    await ensureDeviceCommandCapability(db, deviceId, command);
    await readyDevice.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      COMMAND_CHARACTERISTIC_UUID,
      encodeBase64(JSON.stringify({ type: command })),
    );
    await createCommandAuditEvent(db, deviceId, command, "sent");
  } catch (error) {
    await createCommandAuditEvent(db, deviceId, command, "failed", error);
    throw error;
  }
};

export const sendStardustDeviceWifiConfig = async (
  db: SQLiteDatabase,
  deviceId: string,
  input: { ssid: string; password: string },
) => {
  const ble = await getBleManager();
  const device = connectedDevices.get(deviceId) ?? (await ble.connectToDevice(deviceId, { timeout: 10000 }));
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
  await activateStardustDevice(db, ble, readyDevice, { syncAfterActivate: false });
  await wait(350);
  await readyDevice.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    COMMAND_CHARACTERISTIC_UUID,
    encodeBase64(JSON.stringify({ type: "wifi", ssid: input.ssid, password: input.password })),
  );
  await createDeviceEvent(db, {
    deviceId,
    eventType: "command",
    content: "Stardust Sense Wi-Fi configuration sent",
    metadata: { command: "wifi", status: "sent", source: "mobile_ble" },
  });
};

export const disconnectStardustDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  await ble.cancelDeviceConnection(deviceId).catch(async () => {
    await connectedDevices.get(deviceId)?.cancelConnection().catch(() => undefined);
  });
  eventSubscriptions.get(deviceId)?.remove();
  eventSubscriptions.delete(deviceId);
  photoSubscriptions.get(deviceId)?.remove();
  photoSubscriptions.delete(deviceId);
  activePhotoTransfers.delete(deviceId);
  disconnectSubscriptions.get(deviceId)?.remove();
  disconnectSubscriptions.delete(deviceId);
  connectedDevices.delete(deviceId);
  await updateDeviceStatus(db, deviceId, "disconnected");
  await createConnectionAuditEvent(db, deviceId, "disconnected");
};
