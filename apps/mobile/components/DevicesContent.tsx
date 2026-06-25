import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, ScrollView, useColorScheme, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Toast, type ToastTone } from "@/components/ui/toast";
import { createDevicePhotoEvent, listDevices, listEpisodes, type DeviceRecord } from "@/lib/db";
import {
  getStardustBleStatus,
  restoreStardustDeviceSubscriptions,
  scanStardustDevices,
  sendStardustDeviceCommand,
  sendStardustDeviceWifiConfig,
  subscribeToStardustDevice,
  watchStardustBleStatus,
  type StardustBleStatus,
} from "@/lib/devices/ble";
import { getDeviceCapabilitySummary, supportsDeviceCommand } from "@/lib/devices/capabilities";
import { t } from "@/lib/i18n";
import { getDeviceKindLabel } from "@/lib/memoryLabels";

type ToastState =
  | { visible: false; message: string; tone: ToastTone }
  | { visible: true; message: string; tone: ToastTone };

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("settings.testFailed");
};

const blobToDataUri = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read photo."));
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read photo."));
    };
    reader.readAsDataURL(blob);
  });

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

const openDeviceInbox = () => {
  router.push("/inbox?tab=devices" as Href);
};

export function DevicesContent({ embedded = false }: { embedded?: boolean }) {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const previewIconColor = colorScheme === "dark" ? "#C7D2FE" : "#312E81";
  const [scanning, setScanning] = useState(false);
  const [restoringDevices, setRestoringDevices] = useState(false);
  const [bleStatus, setBleStatus] = useState<StardustBleStatus>("unavailable");
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [latestPhotoUri, setLatestPhotoUri] = useState<string>();
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [provisioningWifi, setProvisioningWifi] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    tone: "success",
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      Promise.all([listDevices(db), listEpisodes(db, 40), getStardustBleStatus()])
        .then(([nextDevices, nextEpisodes, nextBleStatus]) => {
          if (!active) return;
          setDevices(nextDevices);
          setLatestPhotoUri(
            nextEpisodes.find((episode) => episode.source === "iot" && episode.mediaUri)?.mediaUri,
          );
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
      const interval = setInterval(() => {
        if (active) void refreshDeviceState().catch(() => undefined);
      }, 2500);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [db]),
  );

  const showToast = (message: string, tone: ToastTone) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
      toastTimerRef.current = null;
    }, 2400);
  };

  const refreshDeviceState = useCallback(async () => {
    const [nextDevices, nextEpisodes, nextBleStatus] = await Promise.all([
      listDevices(db),
      listEpisodes(db, 40),
      getStardustBleStatus(),
    ]);
    setDevices(nextDevices);
    setLatestPhotoUri(
      nextEpisodes.find((episode) => episode.source === "iot" && episode.mediaUri)?.mediaUri,
    );
    setBleStatus(nextBleStatus);
    return { devices: nextDevices, bleStatus: nextBleStatus };
  }, [db]);

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
    setCapturing(true);
    try {
      if (device.networkCaptureUrl) {
        const response = await fetch(`${device.networkCaptureUrl}?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP capture failed: ${response.status}`);
        const mediaUri = await blobToDataUri(await response.blob());
        await createDevicePhotoEvent(db, {
          id: `wifi-photo-${Date.now()}`,
          deviceId: device.id,
          content: "Photo captured by Stardust Sense over Wi-Fi",
          mediaUri,
          metadata: {
            source: "wifi-http",
            captureUrl: device.networkCaptureUrl,
          },
        });
      } else {
        await sendStardustDeviceCommand(db, device.id, "capture");
      }
      showToast(t("settings.deviceCaptureSent"), "success");
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setCapturing(false);
    }
  };

  const onProvisionWifi = async (device: DeviceRecord) => {
    if (!wifiSsid.trim()) {
      showToast(t("devices.wifiSsidRequired"), "error");
      return;
    }

    setProvisioningWifi(true);
    try {
      await sendStardustDeviceWifiConfig(db, device.id, {
        ssid: wifiSsid.trim(),
        password: wifiPassword,
      });
      showToast(t("devices.wifiConfigSent"), "success");
      setTimeout(() => {
        void refreshDeviceState().catch(() => undefined);
      }, 4500);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setProvisioningWifi(false);
    }
  };
  const connectedDevice = devices.find((device) => device.status === "connected");
  const primaryDevice = connectedDevice ?? devices[0];
  const primaryActionLabel = scanning
    ? t("settings.scanningDevices")
    : capturing
      ? t("devices.capturingPhoto")
    : connectedDevice
      ? t("devices.capturePhoto")
      : primaryDevice
        ? t("devices.connectDevice")
        : t("settings.scanDevices");
  const primaryActionIcon = connectedDevice
    ? "camera-outline"
    : primaryDevice
      ? "link-outline"
      : "search-outline";
  const primaryActionDisabled =
    scanning ||
    capturing ||
    bleStatus !== "poweredOn" ||
    !!(connectedDevice && !supportsDeviceCommand(connectedDevice, "capture"));

  const onPrimaryAction = async () => {
    if (connectedDevice) {
      await onCaptureDevice(connectedDevice);
      return;
    }
    if (primaryDevice) {
      await onSubscribeDevice(primaryDevice);
      return;
    }
    await onScanDevices();
  };

  const content = (
    <>
      <Toast visible={toast.visible} message={toast.message} tone={toast.tone} />

      <View style={{ gap: 14 }}>
        <Card className="gap-4 p-4">
          <CardHeader className="px-0">
            <View className="flex-row items-center gap-2">
              <Ionicons name="videocam-outline" size={18} color={iconColor} />
              <CardTitle>{t("devices.cameraTitle")}</CardTitle>
            </View>
            <CardDescription>{t("devices.cameraDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="gap-3 px-0">
            {latestPhotoUri ? (
              <Image
                source={{ uri: latestPhotoUri }}
                className="aspect-[4/3] w-full rounded-md bg-muted"
                resizeMode="cover"
                accessibilityLabel={t("devices.latestPhoto")}
              />
            ) : (
              <View className="aspect-[4/3] items-center justify-center gap-3 rounded-md border border-border bg-muted/60">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-background/80">
                  <Ionicons name="camera-outline" size={28} color={previewIconColor} />
                </View>
                <Text className="text-center text-sm font-medium">{t("devices.cameraUnavailable")}</Text>
                <Text className="px-8 text-center text-xs leading-4 text-muted-foreground">
                  {t("devices.cameraStatusIdle")}
                </Text>
              </View>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 p-4">
          <CardHeader className="px-0">
            <View className="flex-row items-center gap-2">
              <Ionicons name="bluetooth-outline" size={18} color={iconColor} />
              <CardTitle>{t("devices.testTitle")}</CardTitle>
            </View>
            <CardDescription>{t("devices.testDescription")}</CardDescription>
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
              onPress={() => void onPrimaryAction()}
              disabled={primaryActionDisabled}
              className="w-full"
            >
              <Ionicons name={primaryActionIcon} size={16} color={colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA"} />
              <Text>{primaryActionLabel}</Text>
            </Button>
            <View className="flex-row gap-2">
              <Button variant="outline" onPress={openDeviceInbox} className="flex-1">
                <Ionicons name="file-tray-full-outline" size={16} color={iconColor} />
                <Text>{t("settings.openDeviceInbox")}</Text>
              </Button>
              <Button
                variant="outline"
                onPress={() => void onRestoreDeviceSubscriptions()}
                disabled={restoringDevices || bleStatus !== "poweredOn"}
                className="flex-1"
              >
                <Ionicons name="refresh-outline" size={16} color={iconColor} />
                <Text>{restoringDevices ? t("settings.scanningDevices") : t("devices.refresh")}</Text>
              </Button>
            </View>

            {connectedDevice ? (
              <View className="gap-3 rounded-md border border-border p-3">
                <Text className="text-sm font-semibold">{t("devices.wifiTitle")}</Text>
                {connectedDevice.networkCaptureUrl ? (
                  <Text className="text-xs text-muted-foreground">
                    {connectedDevice.networkCaptureUrl}
                  </Text>
                ) : null}
                <View className="gap-2">
                  <Label htmlFor="stardust-wifi-ssid">{t("devices.wifiSsid")}</Label>
                  <Input
                    id="stardust-wifi-ssid"
                    value={wifiSsid}
                    onChangeText={setWifiSsid}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View className="gap-2">
                  <Label htmlFor="stardust-wifi-password">{t("devices.wifiPassword")}</Label>
                  <Input
                    id="stardust-wifi-password"
                    value={wifiPassword}
                    onChangeText={setWifiPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>
                <Button
                  variant="outline"
                  onPress={() => void onProvisionWifi(connectedDevice)}
                  disabled={provisioningWifi}
                >
                  <Ionicons name="wifi-outline" size={16} color={iconColor} />
                  <Text>{provisioningWifi ? t("devices.configuringWifi") : t("devices.configureWifi")}</Text>
                </Button>
              </View>
            ) : null}

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
                </View>
              ))
            ) : (
              <Text className="text-sm text-muted-foreground">{t("settings.noDevices")}</Text>
            )}
          </CardContent>
        </Card>
      </View>
    </>
  );

  if (embedded) return content;

  return (
    <ScrollView contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 28 }}>
      {content}
    </ScrollView>
  );
}
