import { PermissionsAndroid, Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

import { createDeviceEvent, listDevices, updateDeviceStatus, upsertDevice } from "@/lib/db";

const STARDUST_DEVICE_NAME = "Stardust Sense";
const SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
const STATUS_CHARACTERISTIC_UUID = "7b3f4a11-9d62-4a7d-a0d9-2ffb9239c4d1";
const EVENT_CHARACTERISTIC_UUID = "7b3f4a12-9d62-4a7d-a0d9-2ffb9239c4d1";
const COMMAND_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";
const MANIFEST_CHARACTERISTIC_UUID = "7b3f4a14-9d62-4a7d-a0d9-2ffb9239c4d1";

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

let manager: BleManagerInstance | null = null;
const connectedDevices = new Map<string, DeviceInstance>();
const disconnectSubscriptions = new Map<string, Subscription>();
const eventSubscriptions = new Map<string, Subscription>();

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

  try {
    await ensureBlePermissions();
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

const scopedDeviceEventId = (deviceId: string, eventId?: string) =>
  eventId ? `${deviceId}:${eventId}` : undefined;

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
) => {
  disconnectSubscriptions.get(readyDevice.id)?.remove();
  disconnectSubscriptions.set(readyDevice.id, ble.onDeviceDisconnected(readyDevice.id, () => {
    connectedDevices.delete(readyDevice.id);
    eventSubscriptions.get(readyDevice.id)?.remove();
    eventSubscriptions.delete(readyDevice.id);
    disconnectSubscriptions.get(readyDevice.id)?.remove();
    disconnectSubscriptions.delete(readyDevice.id);
    void updateDeviceStatus(db, readyDevice.id, "disconnected");
  }));
  connectedDevices.set(readyDevice.id, readyDevice);
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
        firmware?: string;
      };
      await upsertDevice(db, {
        id: readyDevice.id,
        name: readyDevice.name ?? STARDUST_DEVICE_NAME,
        status: "connected",
        batteryLevel: parsed.battery,
        firmwareVersion: parsed.firmware,
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
      await createDeviceEvent(db, {
        id: `manifest-${readyDevice.id}-${stableHash(manifest.value)}`,
        deviceId: readyDevice.id,
        eventType: "manifest",
        content: "Stardust Sense manifest synchronized",
        metadata: parsed,
      });
    } catch {
      // Ignore malformed manifests.
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
          const event = JSON.parse(decodeBase64(characteristic.value)) as {
            id?: string;
            type?: string;
            content?: string;
            ts?: string;
            metadata?: Record<string, unknown>;
          };
          void createDeviceEvent(db, {
            id: scopedDeviceEventId(readyDevice.id, event.id),
            deviceId: readyDevice.id,
            eventType: event.type ?? "capture",
            content: event.content ?? "Screen-off capture",
            metadata: {
              ...(event.metadata ?? {}),
              deviceTimestamp: event.ts,
            },
            createdAt: normalizeEventTimestamp(event.ts),
          });
        } catch {
          // Ignore malformed event payloads.
        }
      },
    ),
  );

  await readyDevice.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    COMMAND_CHARACTERISTIC_UUID,
    encodeBase64(JSON.stringify({ type: "sync" })),
  );
};

export const subscribeToStardustDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  const device = connectedDevices.get(deviceId) ?? (await ble.connectToDevice(deviceId, { timeout: 10000 }));
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
  await activateStardustDevice(db, ble, readyDevice);
};

export const restoreStardustDeviceSubscriptions = async (db: SQLiteDatabase) => {
  const devices = await listDevices(db);
  const connected = devices.filter((device) => device.status === "connected");
  await Promise.allSettled(
    connected.map((device) => subscribeToStardustDevice(db, device.id)),
  );
};

export const sendStardustDeviceCommand = async (
  db: SQLiteDatabase,
  deviceId: string,
  command: "capture" | "sync" | "sleep",
) => {
  const ble = await getBleManager();
  const device = connectedDevices.get(deviceId) ?? (await ble.connectToDevice(deviceId, { timeout: 10000 }));
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
  connectedDevices.set(readyDevice.id, readyDevice);
  await upsertDevice(db, {
    id: readyDevice.id,
    name: readyDevice.name ?? STARDUST_DEVICE_NAME,
    status: "connected",
  });
  await readyDevice.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    COMMAND_CHARACTERISTIC_UUID,
    encodeBase64(JSON.stringify({ type: command })),
  );
};

export const disconnectStardustDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  await ble.cancelDeviceConnection(deviceId).catch(async () => {
    await connectedDevices.get(deviceId)?.cancelConnection().catch(() => undefined);
  });
  eventSubscriptions.get(deviceId)?.remove();
  eventSubscriptions.delete(deviceId);
  disconnectSubscriptions.get(deviceId)?.remove();
  disconnectSubscriptions.delete(deviceId);
  connectedDevices.delete(deviceId);
  await updateDeviceStatus(db, deviceId, "disconnected");
};
