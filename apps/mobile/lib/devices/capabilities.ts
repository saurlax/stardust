import type { DeviceRecord } from "@/lib/db";
import { t } from "@/lib/i18n";

type DeviceCommand = "capture" | "sync" | "sleep";

const deviceCommandCapabilities: Record<DeviceCommand, string> = {
  capture: "command-capture",
  sync: "command-sync",
  sleep: "command-sleep",
};

const capabilityLabelKeys: Record<string, string> = {
  "ble-metadata": "deviceCapabilities.bleMetadata",
  "button-capture": "deviceCapabilities.buttonCapture",
  "serial-capture": "deviceCapabilities.serialCapture",
  "command-capture": "deviceCapabilities.commandCapture",
  "command-sync": "deviceCapabilities.commandSync",
  "command-sleep": "deviceCapabilities.commandSleep",
  "ble-photo": "deviceCapabilities.blePhoto",
  "wifi-provision": "deviceCapabilities.wifiProvision",
  "wifi-http-photo": "deviceCapabilities.wifiHttpPhoto",
};

export const supportsDeviceCommand = (
  device: DeviceRecord,
  command: DeviceCommand,
) => {
  if (!device.capabilities?.length) return true;
  return device.capabilities.includes(deviceCommandCapabilities[command]);
};

export const getDeviceCapabilityLabel = (capability: string) => {
  const key = capabilityLabelKeys[capability];
  return key ? t(key) : capability;
};

export const getDeviceCapabilitySummary = (capabilities?: string[]) =>
  capabilities?.length ? capabilities.map(getDeviceCapabilityLabel).join(", ") : undefined;
