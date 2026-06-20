import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

import { createDeviceEvent, updateDeviceStatus, upsertDevice } from "@/lib/db";

const STARDUST_DEVICE_NAME = "Stardust Sense";
const SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
const STATUS_CHARACTERISTIC_UUID = "7b3f4a11-9d62-4a7d-a0d9-2ffb9239c4d1";
const EVENT_CHARACTERISTIC_UUID = "7b3f4a12-9d62-4a7d-a0d9-2ffb9239c4d1";
const COMMAND_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";

type BlePlxModule = typeof import("react-native-ble-plx");
type BleManagerInstance = InstanceType<BlePlxModule["BleManager"]>;

let manager: BleManagerInstance | null = null;

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
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
  return new TextDecoder().decode(new Uint8Array(bytes));
};

const getBleManager = async () => {
  if (Platform.OS === "web") {
    throw new Error("BLE requires a native development build.");
  }
  if (manager) return manager;

  try {
    const { BleManager } = await import("react-native-ble-plx");
    manager = new BleManager();
    return manager;
  } catch {
    throw new Error("BLE is unavailable. Build a custom dev client with react-native-ble-plx.");
  }
};

const normalizeEventTimestamp = (value?: string) => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
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

export const subscribeToStardustDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  const device = await ble.connectToDevice(deviceId, { timeout: 10000 });
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
  ble.onDeviceDisconnected(readyDevice.id, () => {
    void updateDeviceStatus(db, readyDevice.id, "disconnected");
  });
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
          id: event.id,
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
  );

  await readyDevice.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    COMMAND_CHARACTERISTIC_UUID,
    encodeBase64(JSON.stringify({ type: "sync" })),
  );
};

export const sendStardustDeviceCommand = async (
  db: SQLiteDatabase,
  deviceId: string,
  command: "capture" | "sync" | "sleep",
) => {
  const ble = await getBleManager();
  const device = await ble.connectToDevice(deviceId, { timeout: 10000 });
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
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
