import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, useColorScheme, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Toast, type ToastTone } from "@/components/ui/toast";
import { useConfig } from "@/context/config";
import { testLocalConnection } from "@/lib/api";
import type { AiConfig } from "@/lib/config";
import { getCachedAiConfig, getConfigValidationError } from "@/lib/config";
import { listDevices, type DeviceRecord } from "@/lib/db";
import {
  disconnectStardustDevice,
  getStardustBleStatus,
  restoreStardustDeviceSubscriptions,
  scanStardustDevices,
  sendStardustDeviceCommand,
  subscribeToStardustDevice,
  watchStardustBleStatus,
  type StardustBleStatus,
} from "@/lib/devices/ble";
import { getDeviceCapabilitySummary, supportsDeviceCommand } from "@/lib/devices/capabilities";
import { t } from "@/lib/i18n";
import { getDeviceKindLabel } from "@/lib/memoryLabels";

type SettingsFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
};

type ToastState =
  | { visible: false; message: string; tone: ToastTone }
  | { visible: true; message: string; tone: ToastTone };

function SettingsField({ label, id, ...props }: SettingsFieldProps) {
  const fieldId = id ?? label;
  return (
    <View className="gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} {...props} />
    </View>
  );
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("settings.testFailed");
};

const getDeviceDetailLines = (device: DeviceRecord) =>
  [
    `${t("settings.lastSeen")}: ${
      device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : t("settings.neverSeen")
    }`,
    device.batteryLevel === undefined ? undefined : `${t("settings.battery")}: ${device.batteryLevel}%`,
    device.firmwareVersion ? `${t("settings.firmware")}: ${device.firmwareVersion}` : undefined,
    device.protocolVersion ? `${t("settings.protocol")}: ${device.protocolVersion}` : undefined,
    device.capabilities?.length
      ? `${t("settings.capabilities")}: ${getDeviceCapabilitySummary(device.capabilities)}`
      : undefined,
    `${t("settings.deviceEventCount")}: ${device.eventCount}`,
    device.pendingReviewCount
      ? `${t("settings.pendingReviews")}: ${device.pendingReviewCount}`
      : undefined,
    device.reviewedEventCount
      ? `${t("settings.reviewedEvents")}: ${device.reviewedEventCount}`
      : undefined,
    device.lastEventAt
      ? `${t("settings.lastEvent")}: ${new Date(device.lastEventAt).toLocaleString()}`
      : undefined,
  ].filter(Boolean);

const getBleStatusLabel = (status: StardustBleStatus) => {
  switch (status) {
    case "poweredOn":
      return t("settings.blePoweredOn");
    case "poweredOff":
      return t("settings.blePoweredOff");
    case "unsupported":
      return t("settings.bleUnsupported");
    case "unauthorized":
      return t("settings.bleUnauthorized");
    default:
      return t("settings.bleUnavailable");
  }
};

const getDeviceStatusLabel = (status: DeviceRecord["status"]) => {
  switch (status) {
    case "connected":
      return t("settings.deviceStatusConnected");
    case "disconnected":
      return t("settings.deviceStatusDisconnected");
    default:
      return t("settings.deviceStatusKnown");
  }
};

const getSubscribeLabel = (device: DeviceRecord) => {
  if (device.status === "connected") return t("settings.resubscribeDevice");
  if (device.status === "disconnected") return t("settings.reconnectDevice");
  return t("settings.subscribeDevice");
};

const getCommandLabel = (
  device: DeviceRecord,
  command: "capture" | "sync" | "sleep",
) => {
  if (supportsDeviceCommand(device, command)) {
    switch (command) {
      case "capture":
        return t("settings.captureDevice");
      case "sync":
        return t("settings.syncDevice");
      case "sleep":
        return t("settings.sleepDevice");
    }
  }

  switch (command) {
    case "capture":
      return t("settings.captureDeviceUnavailable");
    case "sync":
      return t("settings.syncDeviceUnavailable");
    case "sleep":
      return t("settings.sleepDeviceUnavailable");
  }
};

const getReviewDeviceEventsLabel = (device: DeviceRecord) =>
  device.pendingReviewCount
    ? `${t("settings.reviewDeviceEvents")} (${device.pendingReviewCount})`
    : t("settings.reviewDeviceEvents");

const openDeviceInbox = () => {
  router.push("/inbox?tab=devices" as Href);
};

const openDeviceInboxForDevice = (deviceId: string) => {
  router.push(`/inbox?tab=devices&deviceId=${encodeURIComponent(deviceId)}` as Href);
};

export function SettingsContent() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const { config, ready, updateConfig } = useConfig();
  const [form, setForm] = useState<AiConfig>(getCachedAiConfig());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [restoringDevices, setRestoringDevices] = useState(false);
  const [bleStatus, setBleStatus] = useState<StardustBleStatus>("unavailable");
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    tone: "success",
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ready) setForm(config);
  }, [config, ready]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | undefined;

    void watchStardustBleStatus((nextStatus) => {
      if (active) setBleStatus(nextStatus);
    }).then((nextSubscription) => {
      if (active) {
        subscription = nextSubscription;
      } else {
        nextSubscription.remove();
      }
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listDevices(db), getStardustBleStatus()])
        .then(([nextDevices, nextBleStatus]) => {
          if (!active) return;
          setDevices(nextDevices);
          setBleStatus(nextBleStatus);
          if (nextBleStatus !== "poweredOn") return;
          void restoreStardustDeviceSubscriptions(db)
            .then(() => listDevices(db))
            .then((restoredDevices) => {
              if (active) setDevices(restoredDevices);
            })
            .catch(() => undefined);
        })
        .catch(() => {
          if (!active) return;
          setDevices([]);
          setBleStatus("unavailable");
        });
      return () => {
        active = false;
      };
    }, [db]),
  );

  const validationMessage = useMemo(() => {
    const key = getConfigValidationError(form);
    return key ? t(key) : null;
  }, [form]);

  const showToast = (message: string, tone: ToastTone) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
      toastTimerRef.current = null;
    }, 2400);
  };

  const refreshDeviceState = useCallback(async () => {
    const [nextDevices, nextBleStatus] = await Promise.all([
      listDevices(db),
      getStardustBleStatus(),
    ]);
    setDevices(nextDevices);
    setBleStatus(nextBleStatus);
    return { devices: nextDevices, bleStatus: nextBleStatus };
  }, [db]);

  const updateLocalField = <K extends keyof AiConfig["local"]>(
    key: K,
    value: AiConfig["local"][K],
  ) => {
    setForm((current) => ({
      ...current,
      local: { ...current.local, [key]: value },
    }));
  };

  const onSave = async () => {
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }
    setSaving(true);
    try {
      await updateConfig(form);
      showToast(t("settings.saved"), "success");
    } finally {
      setSaving(false);
    }
  };

  const onTestConnection = async () => {
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }
    setTesting(true);
    try {
      await testLocalConnection(form.local);
      showToast(t("settings.testPassed"), "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setTesting(false);
    }
  };

  const onScanDevices = async () => {
    setScanning(true);
    try {
      const nextBleStatus = await getStardustBleStatus();
      setBleStatus(nextBleStatus);
      if (nextBleStatus !== "poweredOn") {
        showToast(getBleStatusLabel(nextBleStatus), "error");
        return;
      }
      const found = await scanStardustDevices(db);
      showToast(
        found.length ? t("settings.deviceScanFound") : t("settings.deviceScanEmpty"),
        found.length ? "success" : "error",
      );
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setScanning(false);
    }
  };

  const onSubscribeDevice = async (device: DeviceRecord) => {
    try {
      await subscribeToStardustDevice(db, device.id);
      showToast(t("settings.deviceSubscribed"), "success");
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const onRestoreDeviceSubscriptions = async () => {
    setRestoringDevices(true);
    try {
      const nextBleStatus = await getStardustBleStatus();
      setBleStatus(nextBleStatus);
      if (nextBleStatus !== "poweredOn") {
        showToast(getBleStatusLabel(nextBleStatus), "error");
        return;
      }
      await restoreStardustDeviceSubscriptions(db);
      await refreshDeviceState();
      showToast(t("settings.deviceSubscriptionsRestored"), "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setRestoringDevices(false);
    }
  };

  const onCaptureDevice = async (device: DeviceRecord) => {
    try {
      await sendStardustDeviceCommand(db, device.id, "capture");
      showToast(t("settings.deviceCaptureSent"), "success");
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const onSyncDevice = async (device: DeviceRecord) => {
    try {
      await sendStardustDeviceCommand(db, device.id, "sync");
      showToast(t("settings.deviceSyncSent"), "success");
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const onSleepDevice = async (device: DeviceRecord) => {
    try {
      await sendStardustDeviceCommand(db, device.id, "sleep");
      await disconnectStardustDevice(db, device.id);
      showToast(t("settings.deviceSleepSent"), "success");
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const onDisconnectDevice = async (device: DeviceRecord) => {
    try {
      await disconnectStardustDevice(db, device.id);
      showToast(t("settings.deviceDisconnected"), "success");
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return (
    <>
      <Toast visible={toast.visible} message={toast.message} tone={toast.tone} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-sm leading-5 text-muted-foreground">
            {t("settings.description")}
          </Text>

          <Card className="gap-4 p-4">
            <CardHeader className="px-0">
              <CardTitle>{t("settings.localTitle")}</CardTitle>
              <CardDescription>{t("settings.localDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="gap-4 px-0">
              <SettingsField
                label={t("settings.localBaseURL")}
                value={form.local.baseURL}
                onChangeText={(value) => updateLocalField("baseURL", value)}
                placeholder={t("settings.localBaseURLPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <SettingsField
                label={t("settings.localApiKey")}
                value={form.local.apiKey}
                onChangeText={(value) => updateLocalField("apiKey", value)}
                placeholder={t("settings.localApiKeyPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <SettingsField
                label={t("settings.localModel")}
                value={form.local.model}
                onChangeText={(value) => updateLocalField("model", value)}
                placeholder={t("settings.localModelPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </CardContent>
          </Card>

          <Card className="gap-4 p-4">
            <CardHeader className="px-0">
              <View className="flex-row items-center gap-2">
                <Ionicons name="bluetooth-outline" size={18} color={iconColor} />
                <CardTitle>{t("settings.devicesTitle")}</CardTitle>
              </View>
              <CardDescription>{t("settings.devicesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="gap-3 px-0">
              <View className="flex-row items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                <Ionicons
                  name={bleStatus === "poweredOn" ? "radio-outline" : "alert-circle-outline"}
                  size={16}
                  color={iconColor}
                />
                <Text className="text-sm">{getBleStatusLabel(bleStatus)}</Text>
              </View>
              <Button
                variant="outline"
                onPress={() => void onScanDevices()}
                disabled={scanning || bleStatus !== "poweredOn"}
                className="w-full"
              >
                <Text>{scanning ? t("settings.scanningDevices") : t("settings.scanDevices")}</Text>
              </Button>
              <Button variant="outline" onPress={openDeviceInbox} className="w-full">
                <Ionicons name="file-tray-full-outline" size={16} color={iconColor} />
                <Text>{t("settings.openDeviceInbox")}</Text>
              </Button>
              <Button
                variant="outline"
                onPress={() => void onRestoreDeviceSubscriptions()}
                disabled={restoringDevices || bleStatus !== "poweredOn"}
                className="w-full"
              >
                <Ionicons name="refresh-outline" size={16} color={iconColor} />
                <Text>
                  {restoringDevices
                    ? t("settings.restoringDeviceSubscriptions")
                    : t("settings.restoreDeviceSubscriptions")}
                </Text>
              </Button>

              {devices.length ? (
                devices.map((device) => (
                  <View key={device.id} className="gap-2 rounded-md border border-border p-3">
                    <Text className="text-sm font-semibold">{device.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {getDeviceKindLabel(device.kind)} · {getDeviceStatusLabel(device.status)}
                    </Text>
                    {getDeviceDetailLines(device).map((line) => (
                      <Text key={line} className="text-xs text-muted-foreground">
                        {line}
                      </Text>
                    ))}
                    <View className="flex-row flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => void onSubscribeDevice(device)}
                      >
                        <Text>{getSubscribeLabel(device)}</Text>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!supportsDeviceCommand(device, "capture")}
                        onPress={() => void onCaptureDevice(device)}
                      >
                        <Text>{getCommandLabel(device, "capture")}</Text>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!supportsDeviceCommand(device, "sync")}
                        onPress={() => void onSyncDevice(device)}
                      >
                        <Text>{getCommandLabel(device, "sync")}</Text>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!supportsDeviceCommand(device, "sleep")}
                        onPress={() => void onSleepDevice(device)}
                      >
                        <Text>{getCommandLabel(device, "sleep")}</Text>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => void onDisconnectDevice(device)}
                      >
                        <Text>{t("settings.disconnectDevice")}</Text>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => openDeviceInboxForDevice(device.id)}
                      >
                        <Text>{getReviewDeviceEventsLabel(device)}</Text>
                      </Button>
                    </View>
                  </View>
                ))
              ) : (
                <Text className="text-sm text-muted-foreground">{t("settings.noDevices")}</Text>
              )}
            </CardContent>
          </Card>

          <View className="gap-3">
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("settings.testConnection")}
              onPress={() => void onTestConnection()}
              disabled={testing || saving || !ready}
              variant="outline"
              className="w-full"
            >
              <Text>{testing ? t("settings.testingConnection") : t("settings.testConnection")}</Text>
            </Button>

            <Button
              accessibilityRole="button"
              accessibilityLabel={t("settings.saveSettings")}
              onPress={() => void onSave()}
              disabled={saving || testing || !ready}
              className="w-full"
            >
              <Text>{saving ? t("settings.saving") : t("settings.save")}</Text>
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
