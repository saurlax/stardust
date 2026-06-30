import { t } from "@/lib/i18n";

const capabilityLabelKeys: Record<string, string> = {
  "ble-metadata": "deviceCapabilities.bleMetadata",
  "ble-wifi-provision": "deviceCapabilities.bleWifiProvision",
  "button-capture": "deviceCapabilities.buttonCapture",
  "serial-capture": "deviceCapabilities.serialCapture",
  "http-capture": "deviceCapabilities.httpCapture",
  "http-events": "deviceCapabilities.httpEvents",
  "flash-ring-storage": "deviceCapabilities.flashRingStorage",
  "sd-card": "deviceCapabilities.sdCard",
  "static-files": "deviceCapabilities.staticFiles",
  "wifi-provision": "deviceCapabilities.wifiProvision",
  "wifi-http-photo": "deviceCapabilities.wifiHttpPhoto",
};

export const getDeviceCapabilityLabel = (capability: string) => {
  const key = capabilityLabelKeys[capability];
  return key ? t(key) : capability;
};

export const getDeviceCapabilitySummary = (capabilities?: string[]) =>
  capabilities?.length ? capabilities.map(getDeviceCapabilityLabel).join(", ") : undefined;
