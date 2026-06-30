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
import { listDevices, listEpisodes, type DeviceRecord } from "@/lib/db";
import {
  getStardustBleStatus,
  getStardustProvisioningBaseUrl,
  readStardustDeviceProvisioningState,
  resetStardustDeviceWifiConfig,
  scanStardustDevices,
  sendStardustDeviceWifiConfig,
  subscribeToStardustDevice,
  watchStardustBleStatus,
  type StardustBleStatus,
} from "@/lib/devices/ble";
import { getDeviceCapabilitySummary } from "@/lib/devices/capabilities";
import {
  captureStardustDeviceHttp,
  resetStardustDeviceWifiHttp,
  syncStardustDeviceHttp,
} from "@/lib/devices/http";
import { t } from "@/lib/i18n";
import { getDeviceKindLabel } from "@/lib/memoryLabels";

type ToastState =
  | { visible: false; message: string; tone: ToastTone }
  | { visible: true; message: string; tone: ToastTone };

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

const getDeviceNetworkLabel = (device: DeviceRecord) =>
  device.networkCaptureUrl ? t("devices.networkConnected") : t("devices.networkNotConfigured");

const openDeviceInbox = () => {
  router.push("/inbox?tab=devices" as Href);
};

export function DevicesContent() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const previewIconColor = colorScheme === "dark" ? "#C7D2FE" : "#312E81";
  const [scanning, setScanning] = useState(false);
  const [refreshingDevices, setRefreshingDevices] = useState(false);
  const [bleStatus, setBleStatus] = useState<StardustBleStatus>("unavailable");
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [latestPhotoUri, setLatestPhotoUri] = useState<string>();
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [provisioningWifi, setProvisioningWifi] = useState(false);
  const [resettingWifi, setResettingWifi] = useState(false);
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

  const refreshDeviceState = useCallback(async (syncHttp = true) => {
    const [initialDevices, initialEpisodes, nextBleStatus] = await Promise.all([
      listDevices(db),
      listEpisodes(db, 40),
      getStardustBleStatus(),
    ]);
    let syncedCount = 0;
    let syncDeviceCount = 0;
    if (syncHttp) {
      const networkDevices = initialDevices.filter((device) => device.networkCaptureUrl);
      const results = await Promise.allSettled(
        networkDevices.map((device) => syncStardustDeviceHttp(db, device)),
      );
      syncDeviceCount = networkDevices.length;
      syncedCount = results.filter((result) => result.status === "fulfilled").length;
    }
    const nextDevices = syncHttp ? await listDevices(db) : initialDevices;
    const nextEpisodes = syncHttp ? await listEpisodes(db, 40) : initialEpisodes;
    setDevices(nextDevices);
    setLatestPhotoUri(
      nextEpisodes.find((episode) => episode.source === "iot" && episode.mediaUri)?.mediaUri,
    );
    setBleStatus(nextBleStatus);
    return { devices: nextDevices, bleStatus: nextBleStatus, syncDeviceCount, syncedCount };
  }, [db]);

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
          void refreshDeviceState().catch(() => undefined);
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
    }, [db, refreshDeviceState]),
  );

  const showToast = (message: string, tone: ToastTone) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
      toastTimerRef.current = null;
    }, 2400);
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
      const state = await subscribeToStardustDevice(db, device.id);
      showToast(
        state?.baseUrl || state?.captureUrl
          ? t("devices.deviceConnectedWifiReady")
          : t("devices.deviceConnectedNeedsWifi"),
        "success",
      );
      await refreshDeviceState();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const onRefreshDeviceState = async () => {
    setRefreshingDevices(true);
    try {
      const result = await refreshDeviceState();
      if (result.syncDeviceCount > 0 && result.syncedCount < result.syncDeviceCount) {
        showToast(t("devices.syncFailed"), "error");
      } else {
        showToast(t("devices.synced"), "success");
      }
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setRefreshingDevices(false);
    }
  };

  const onCaptureDevice = async (device: DeviceRecord) => {
    setCapturing(true);
    try {
      if (!device.networkCaptureUrl) {
        showToast(t("devices.wifiCaptureUnavailable"), "error");
        return;
      }

      const currentState = await readStardustDeviceProvisioningState(db, device.id).catch(() => undefined);
      const currentBaseUrl = getStardustProvisioningBaseUrl(currentState);
      if (!currentBaseUrl && currentState?.status && currentState.status !== "connected") {
        showToast(t("devices.wifiCaptureUnavailable"), "error");
        await refreshDeviceState(false);
        return;
      }

      let capturedPhotoUri: string | undefined;
      try {
        capturedPhotoUri = await captureStardustDeviceHttp(
          db,
          currentBaseUrl ? { ...device, networkCaptureUrl: `${currentBaseUrl}/capture` } : device,
        );
      } catch (error) {
        const state = await readStardustDeviceProvisioningState(db, device.id).catch(() => undefined);
        const baseUrl = getStardustProvisioningBaseUrl(state);
        const captureUrl = baseUrl ? `${baseUrl}/capture` : undefined;
        if (!captureUrl || captureUrl === device.networkCaptureUrl) throw error;
        capturedPhotoUri = await captureStardustDeviceHttp(db, { ...device, networkCaptureUrl: captureUrl });
      }
      if (capturedPhotoUri) setLatestPhotoUri(capturedPhotoUri);
      showToast(t("settings.deviceCaptureSent"), "success");
      await refreshDeviceState(false);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setCapturing(false);
    }
  };

  const onProvisionWifi = async (device: DeviceRecord) => {
    setProvisioningWifi(true);
    try {
      const state = await readStardustDeviceProvisioningState(db, device.id);
      if (state?.baseUrl || state?.captureUrl) {
        showToast(t("devices.wifiAlreadyConfigured"), "success");
        await refreshDeviceState();
        return;
      }

      if (!wifiSsid.trim()) {
        showToast(t("devices.wifiSsidRequired"), "error");
        return;
      }

      const baseUrl = await sendStardustDeviceWifiConfig(db, device.id, {
        ssid: wifiSsid.trim(),
        password: wifiPassword,
      });
      showToast(baseUrl ? t("devices.wifiConnected") : t("devices.wifiConfigSent"), "success");
      setTimeout(() => {
        void refreshDeviceState().catch(() => undefined);
      }, 4500);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setProvisioningWifi(false);
    }
  };

  const onResetWifi = async (device: DeviceRecord) => {
    setResettingWifi(true);
    try {
      await resetStardustDeviceWifiHttp(db, device).catch(async () => {
        await resetStardustDeviceWifiConfig(db, device.id);
      });
      showToast(t("devices.wifiReset"), "success");
      await refreshDeviceState(false);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setResettingWifi(false);
    }
  };
  const connectedDevice = devices.find((device) => device.status === "connected");
  const primaryDevice = connectedDevice ?? devices[0];
  const connectActionLabel = scanning
    ? t("settings.scanningDevices")
    : primaryDevice
        ? t("devices.connectDevice")
        : t("settings.scanDevices");
  const connectActionIcon = primaryDevice ? "link-outline" : "search-outline";
  const connectActionDisabled = scanning || (primaryDevice ? false : bleStatus !== "poweredOn");

  const onConnectAction = async () => {
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
            <Button
              onPress={() => connectedDevice && void onCaptureDevice(connectedDevice)}
              disabled={capturing || !connectedDevice?.networkCaptureUrl}
              className="w-full"
            >
              <Ionicons name="camera-outline" size={16} color={colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA"} />
              <Text>{capturing ? t("devices.capturingPhoto") : t("devices.capturePhoto")}</Text>
            </Button>
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
              onPress={() => void onConnectAction()}
              disabled={connectActionDisabled}
              className="w-full"
            >
              <Ionicons name={connectActionIcon} size={16} color={colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA"} />
              <Text>{connectActionLabel}</Text>
            </Button>
            <View className="flex-row gap-2">
              <Button variant="outline" onPress={openDeviceInbox} className="flex-1">
                <Ionicons name="file-tray-full-outline" size={16} color={iconColor} />
                <Text>{t("settings.openDeviceInbox")}</Text>
              </Button>
              <Button
                variant="outline"
                onPress={() => void onRefreshDeviceState()}
                disabled={refreshingDevices}
                className="flex-1"
              >
                <Ionicons name="refresh-outline" size={16} color={iconColor} />
                <Text>{refreshingDevices ? t("settings.scanningDevices") : t("devices.refresh")}</Text>
              </Button>
            </View>

            {connectedDevice ? (
              <View className="gap-3 rounded-md border border-border p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm font-semibold">{t("devices.wifiTitle")}</Text>
                  <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                    <View
                      className={`h-2 w-2 rounded-full ${
                        connectedDevice.networkCaptureUrl ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    <Text className="text-xs text-muted-foreground">
                      {getDeviceNetworkLabel(connectedDevice)}
                    </Text>
                  </View>
                </View>
                {connectedDevice.networkCaptureUrl ? (
                  <>
                    <Text className="text-xs text-muted-foreground">
                      {connectedDevice.networkCaptureUrl}
                    </Text>
                    <Button
                      variant="outline"
                      onPress={() => void onResetWifi(connectedDevice)}
                      disabled={resettingWifi}
                    >
                      <Ionicons name="refresh-circle-outline" size={16} color={iconColor} />
                      <Text>{resettingWifi ? t("devices.resettingWifi") : t("devices.resetWifi")}</Text>
                    </Button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </View>
            ) : null}

            {devices.length ? (
              devices.map((device) => (
                <View key={device.id} className="gap-2 rounded-md border border-border p-3">
                  <Text className="text-sm font-semibold">{device.name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {getDeviceKindLabel(device.kind)} · {getDeviceStatusLabel(device.status)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`h-2 w-2 rounded-full ${
                        device.networkCaptureUrl ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    <Text className="text-xs text-muted-foreground">
                      {getDeviceNetworkLabel(device)}
                    </Text>
                  </View>
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

  return (
    <ScrollView contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 28 }}>
      {content}
    </ScrollView>
  );
}
