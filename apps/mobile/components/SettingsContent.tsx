import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
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
import { scanStardustDevices, subscribeToStardustDevice } from "@/lib/devices/ble";
import { t } from "@/lib/i18n";

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

export function SettingsContent() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const { config, ready, updateConfig } = useConfig();
  const [form, setForm] = useState<AiConfig>(getCachedAiConfig());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listDevices(db)
        .then((nextDevices) => {
          if (active) setDevices(nextDevices);
        })
        .catch(() => {
          if (active) setDevices([]);
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
      const found = await scanStardustDevices(db);
      showToast(
        found.length ? t("settings.deviceScanFound") : t("settings.deviceScanEmpty"),
        found.length ? "success" : "error",
      );
      setDevices(await listDevices(db));
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
      setDevices(await listDevices(db));
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
              <Button
                variant="outline"
                onPress={() => void onScanDevices()}
                disabled={scanning}
                className="w-full"
              >
                <Text>{scanning ? t("settings.scanningDevices") : t("settings.scanDevices")}</Text>
              </Button>

              {devices.length ? (
                devices.map((device) => (
                  <View key={device.id} className="gap-2 rounded-md border border-border p-3">
                    <Text className="text-sm font-semibold">{device.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {device.kind} · {device.status}
                    </Text>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => void onSubscribeDevice(device)}
                    >
                      <Text>{t("settings.subscribeDevice")}</Text>
                    </Button>
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
