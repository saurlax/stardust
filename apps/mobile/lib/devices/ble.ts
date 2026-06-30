import { PermissionsAndroid, Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  clearDeviceNetworkCaptureUrl,
  createDeviceEvent,
  listDevices,
  updateDeviceStatus,
  upsertDevice,
} from "@/lib/db";

const STARDUST_DEVICE_NAME = "Stardust Sense";
const SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
const PROVISION_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";

type BlePlxModule = typeof import("react-native-ble-plx");
type BleManagerInstance = InstanceType<BlePlxModule["BleManager"]>;
type DeviceInstance = Awaited<ReturnType<BleManagerInstance["connectToDevice"]>>;
export type StardustBleStatus =
  | "poweredOn"
  | "poweredOff"
  | "unsupported"
  | "unauthorized"
  | "unavailable";
type BleState = Awaited<ReturnType<BleManagerInstance["state"]>>;
export type StardustProvisioningState = {
  status?: "idle" | "connecting" | "connected" | "failed" | string;
  baseUrl?: string;
  captureUrl?: string;
};

let manager: BleManagerInstance | null = null;
const connectedDevices = new Map<string, DeviceInstance>();

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

    const byte2 = bytes[index++] ?? 0;
    const byte3 = bytes[index++] ?? 0;
    result += String.fromCharCode(
      ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f),
    );
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

const withHttpScheme = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `http://${value.replace(/^\/+/, "")}`;

const baseUrlFromProvisioningState = (state?: StardustProvisioningState) => {
  if (state?.baseUrl) return withHttpScheme(state.baseUrl);
  if (state?.captureUrl) {
    return withHttpScheme(state.captureUrl).replace(/\/capture(?:\.jpg)?(?:\?.*)?$/, "");
  }
  return undefined;
};

export const getStardustProvisioningBaseUrl = baseUrlFromProvisioningState;

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

const connectProvisioningDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  const device = connectedDevices.get(deviceId) ?? (await ble.connectToDevice(deviceId, { timeout: 10000 }));
  const readyDevice = await device.discoverAllServicesAndCharacteristics();
  connectedDevices.set(deviceId, readyDevice);
  await upsertDevice(db, {
    id: readyDevice.id,
    name: readyDevice.name ?? STARDUST_DEVICE_NAME,
    status: "connected",
  });
  return readyDevice;
};

const readProvisioningStateFromDevice = async (
  device: DeviceInstance,
): Promise<StardustProvisioningState | undefined> => {
  const characteristic = await device
    .readCharacteristicForService(SERVICE_UUID, PROVISION_CHARACTERISTIC_UUID)
    .catch(() => null);
  if (!characteristic?.value) return undefined;

  try {
    return JSON.parse(decodeBase64(characteristic.value)) as StardustProvisioningState;
  } catch {
    return undefined;
  }
};

const syncProvisioningState = async (
  db: SQLiteDatabase,
  deviceId: string,
  state?: StardustProvisioningState,
) => {
  const baseUrl = baseUrlFromProvisioningState(state);
  if (!baseUrl) {
    if (state?.status && state.status !== "connected") {
      await clearDeviceNetworkCaptureUrl(db, deviceId);
    }
    return undefined;
  }

  await upsertDevice(db, {
    id: deviceId,
    name: STARDUST_DEVICE_NAME,
    status: "connected",
    networkCaptureUrl: `${baseUrl}/capture`,
  });
  return baseUrl;
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
  const readyDevice = await connectProvisioningDevice(db, deviceId);
  const state = await readProvisioningStateFromDevice(readyDevice);
  await syncProvisioningState(db, deviceId, state);
  return state;
};

export const readStardustDeviceProvisioningState = async (
  db: SQLiteDatabase,
  deviceId: string,
) => {
  const readyDevice = await connectProvisioningDevice(db, deviceId);
  const state = await readProvisioningStateFromDevice(readyDevice);
  await syncProvisioningState(db, deviceId, state);
  return state;
};

export const sendStardustDeviceWifiConfig = async (
  db: SQLiteDatabase,
  deviceId: string,
  input: { ssid: string; password: string },
) => {
  const readyDevice = await connectProvisioningDevice(db, deviceId);
  const currentState = await readProvisioningStateFromDevice(readyDevice);
  const existingBaseUrl = await syncProvisioningState(db, deviceId, currentState);
  if (existingBaseUrl) {
    await createDeviceEvent(db, {
      deviceId,
      eventType: "status",
      content: "Stardust Sense already has Wi-Fi connectivity",
      metadata: {
        command: "wifi",
        status: "connected",
        source: "mobile_ble",
        baseUrl: existingBaseUrl,
        skippedProvisioning: true,
      },
    });
    return existingBaseUrl;
  }

  await readyDevice.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    PROVISION_CHARACTERISTIC_UUID,
    encodeBase64(JSON.stringify({ type: "wifi", ssid: input.ssid, password: input.password })),
  );

  let baseUrl: string | undefined;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(attempt === 0 ? 1200 : 1500);
    const result = await readProvisioningStateFromDevice(readyDevice);
    if (result?.status === "failed") break;
    baseUrl = baseUrlFromProvisioningState(result);
    if (baseUrl) break;
  }

  await upsertDevice(db, {
    id: deviceId,
    name: STARDUST_DEVICE_NAME,
    status: "connected",
    networkCaptureUrl: baseUrl ? `${baseUrl}/capture` : undefined,
  });
  await createDeviceEvent(db, {
    deviceId,
    eventType: "command",
    content: "Stardust Sense Wi-Fi configuration sent",
    metadata: { command: "wifi", status: baseUrl ? "connected" : "sent", source: "mobile_ble", baseUrl },
  });
  return baseUrl;
};

export const resetStardustDeviceWifiConfig = async (db: SQLiteDatabase, deviceId: string) => {
  const readyDevice = await connectProvisioningDevice(db, deviceId);
  await readyDevice.writeCharacteristicWithResponseForService(
    SERVICE_UUID,
    PROVISION_CHARACTERISTIC_UUID,
    encodeBase64(JSON.stringify({ type: "wifi-reset" })),
  );
  await wait(800);
  const state = await readProvisioningStateFromDevice(readyDevice);
  await syncProvisioningState(db, deviceId, state);
  await clearDeviceNetworkCaptureUrl(db, deviceId);
  await createDeviceEvent(db, {
    deviceId,
    eventType: "command",
    content: "Stardust Sense Wi-Fi credentials reset",
    metadata: { command: "wifi-reset", status: state?.status ?? "idle", source: "mobile_ble" },
  });
  return state;
};

export const disconnectStardustDevice = async (db: SQLiteDatabase, deviceId: string) => {
  const ble = await getBleManager();
  await ble.cancelDeviceConnection(deviceId).catch(async () => {
    await connectedDevices.get(deviceId)?.cancelConnection().catch(() => undefined);
  });
  connectedDevices.delete(deviceId);
  await updateDeviceStatus(db, deviceId, "disconnected");
};

export const listProvisionedStardustDevices = async (db: SQLiteDatabase) => listDevices(db);
