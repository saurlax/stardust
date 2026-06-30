import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Toast, type ToastTone } from "@/components/ui/toast";
import { useConfig } from "@/context/config";
import { testLocalConnection } from "@/lib/api";
import type { AiConfig, AiProvider, LocalAiConfig } from "@/lib/config";
import { getCachedAiConfig, getConfigValidationError } from "@/lib/config";
import { resetLocalDataWithSeed } from "@/lib/db";
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

const providers: { id: AiProvider; label: string }[] = [
  { id: "local", label: t("settings.localTab") },
  { id: "cloud", label: t("settings.cloudTab") },
];

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("settings.testFailed");
};

export function SettingsContent() {
  const db = useSQLiteContext();
  const { config, ready, updateConfig } = useConfig();
  const [form, setForm] = useState<AiConfig>(getCachedAiConfig());
  const [provider, setProvider] = useState<AiProvider>("local");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resettingData, setResettingData] = useState(false);
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

  const validationMessage = useMemo(() => {
    const key = getConfigValidationError(form, provider);
    return key ? t(key) : null;
  }, [form, provider]);

  const showToast = (message: string, tone: ToastTone) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
      toastTimerRef.current = null;
    }, 2400);
  };

  const updateProviderField = <K extends keyof LocalAiConfig>(
    key: K,
    value: LocalAiConfig[K],
  ) => {
    setForm((current) => ({
      ...current,
      [provider]: { ...current[provider], [key]: value },
    }));
  };

  const activeConfig = form[provider];
  const isLocal = provider === "local";

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
      if (isLocal) {
        await testLocalConnection(form.local);
        showToast(t("settings.connectionReady"), "success");
      } else {
        showToast(t("settings.cloudSaved"), "success");
      }
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setTesting(false);
    }
  };

  const resetData = async () => {
    setResettingData(true);
    try {
      await resetLocalDataWithSeed(db);
      showToast(t("settings.dataResetComplete"), "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setResettingData(false);
    }
  };

  const onResetData = () => {
    Alert.alert(t("settings.resetDataTitle"), t("settings.resetDataConfirm"), [
      { text: t("settings.cancel"), style: "cancel" },
      {
        text: t("settings.resetData"),
        style: "destructive",
        onPress: () => void resetData(),
      },
    ]);
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

          <View className="flex-row gap-2 rounded-md border border-border bg-muted/40 p-1">
            {providers.map((item) => {
              const active = provider === item.id;
              return (
                <Button
                  key={item.id}
                  variant={active ? "default" : "ghost"}
                  onPress={() => setProvider(item.id)}
                  className="flex-1"
                >
                  <View className="items-center">
                    <Text>{item.label}</Text>
                  </View>
                </Button>
              );
            })}
          </View>

          <Card className="gap-4 p-4">
            <CardHeader className="px-0">
              <CardTitle>{isLocal ? t("settings.localTitle") : t("settings.cloudTitle")}</CardTitle>
              <CardDescription>{isLocal ? t("settings.localDescription") : t("settings.cloudDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="gap-4 px-0">
              <SettingsField
                label={isLocal ? t("settings.localBaseURL") : t("settings.cloudBaseURL")}
                value={activeConfig.baseURL}
                onChangeText={(value) => updateProviderField("baseURL", value)}
                placeholder={isLocal ? t("settings.localBaseURLPlaceholder") : t("settings.cloudBaseURLPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <SettingsField
                label={isLocal ? t("settings.localApiKey") : t("settings.cloudApiKey")}
                value={activeConfig.apiKey}
                onChangeText={(value) => updateProviderField("apiKey", value)}
                placeholder={isLocal ? t("settings.localApiKeyPlaceholder") : t("settings.cloudApiKeyPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <SettingsField
                label={isLocal ? t("settings.localModel") : t("settings.cloudModel")}
                value={activeConfig.model}
                onChangeText={(value) => updateProviderField("model", value)}
                placeholder={isLocal ? t("settings.localModelPlaceholder") : t("settings.cloudModelPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </CardContent>
          </Card>

          <View className="gap-3">
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("settings.checkConnection")}
              onPress={() => void onTestConnection()}
              disabled={testing || saving || resettingData || !ready}
              variant="outline"
              className="w-full"
            >
              <Text>{testing ? t("settings.checkingConnection") : t("settings.checkConnection")}</Text>
            </Button>

            <Button
              accessibilityRole="button"
              accessibilityLabel={t("settings.saveSettings")}
              onPress={() => void onSave()}
              disabled={saving || testing || resettingData || !ready}
              className="w-full"
            >
              <Text>{saving ? t("settings.saving") : t("settings.save")}</Text>
            </Button>
          </View>

          <Card className="gap-4 p-4">
            <CardHeader className="px-0">
              <CardTitle>{t("settings.resetData")}</CardTitle>
            </CardHeader>
            <CardContent className="gap-3 px-0">
              <Button
                accessibilityRole="button"
                accessibilityLabel={t("settings.resetData")}
                onPress={onResetData}
                disabled={saving || testing || resettingData || !ready}
                variant="destructive"
                className="w-full"
              >
                <Text>{resettingData ? t("settings.resettingData") : t("settings.resetData")}</Text>
              </Button>
            </CardContent>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
