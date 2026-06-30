import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

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
  const { config, ready, updateConfig } = useConfig();
  const [form, setForm] = useState<AiConfig>(getCachedAiConfig());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
