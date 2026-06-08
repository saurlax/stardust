import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useConfig } from "@/context/config";
import type { AiConfig, RuntimeMode } from "@/lib/config";
import { getCachedAiConfig, getConfigValidationError } from "@/lib/config";
import { testCloudConnection, testLocalConnection } from "@/lib/api";
import { t } from "@/lib/i18n";

type SettingsFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
};

type TestState =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function SettingsField({ label, id, ...props }: SettingsFieldProps) {
  const fieldId = id ?? label;

  return (
    <View className="gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} {...props} />
    </View>
  );
}

function ModeTab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      variant={active ? "default" : "ghost"}
      className="flex-1 rounded-full"
      onPress={onPress}
    >
      <Text>{label}</Text>
    </Button>
  );
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("settings.testFailed");
};

export default function SettingsScreen() {
  const { config, ready, updateConfig } = useConfig();
  const [form, setForm] = useState<AiConfig>(getCachedAiConfig());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ type: "idle" });

  useEffect(() => {
    if (ready) setForm(config);
  }, [config, ready]);

  const validationMessage = useMemo(() => {
    const key = getConfigValidationError(form);
    return key ? t(key) : null;
  }, [form]);

  const updateMode = (runtimeMode: RuntimeMode) => {
    setForm((current) => ({ ...current, runtimeMode }));
    setMessage(null);
    setTestState({ type: "idle" });
  };

  const updateLocalField = <K extends keyof AiConfig["local"]>(
    key: K,
    value: AiConfig["local"][K],
  ) => {
    setForm((current) => ({
      ...current,
      local: { ...current.local, [key]: value },
    }));
    setMessage(null);
    setTestState({ type: "idle" });
  };

  const updateCloudField = <K extends keyof AiConfig["cloud"]>(
    key: K,
    value: AiConfig["cloud"][K],
  ) => {
    setForm((current) => ({
      ...current,
      cloud: { ...current.cloud, [key]: value },
    }));
    setMessage(null);
    setTestState({ type: "idle" });
  };

  const onSave = async () => {
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await updateConfig(form);
      setMessage(t("settings.saved"));
    } finally {
      setSaving(false);
    }
  };

  const onTestConnection = async () => {
    if (validationMessage) {
      setTestState({ type: "error", message: validationMessage });
      return;
    }

    setTesting(true);
    setTestState({ type: "idle" });

    try {
      if (form.runtimeMode === "local") {
        await testLocalConnection(form.local);
      } else {
        await testCloudConnection(form.cloud);
      }

      setTestState({ type: "success", message: t("settings.testPassed") });
    } catch (error) {
      setTestState({ type: "error", message: getErrorMessage(error) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("settings.title"),
          headerShown: true,
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ gap: 14, padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-sm leading-5 text-muted-foreground">
            {t("settings.description")}
          </Text>

          <Card className="gap-4 p-4">
            <CardHeader className="px-0">
              <CardTitle>{t("settings.modeLabel")}</CardTitle>
              <CardDescription>
                {form.runtimeMode === "local"
                  ? t("settings.localDescription")
                  : t("settings.cloudDescription")}
              </CardDescription>
            </CardHeader>

            <CardContent className="gap-4 px-0">
              <View className="flex-row rounded-full bg-muted p-1">
                <ModeTab
                  active={form.runtimeMode === "local"}
                  label={t("settings.localTab")}
                  onPress={() => updateMode("local")}
                />
                <ModeTab
                  active={form.runtimeMode === "cloud"}
                  label={t("settings.cloudTab")}
                  onPress={() => updateMode("cloud")}
                />
              </View>

              {form.runtimeMode === "local" ? (
                <View className="gap-4">
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
                </View>
              ) : (
                <SettingsField
                  label={t("settings.apiBaseURL")}
                  value={form.cloud.apiBaseURL}
                  onChangeText={(value) => updateCloudField("apiBaseURL", value)}
                  placeholder={t("settings.apiBaseURLPlaceholder")}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            </CardContent>
          </Card>

          {message ? (
            <Text className="text-sm font-semibold text-green-600">{message}</Text>
          ) : null}

          {testState.type !== "idle" ? (
            <Text
              className={
                testState.type === "success"
                  ? "text-sm font-semibold text-green-600"
                  : "text-sm font-semibold text-destructive"
              }
            >
              {testState.message}
            </Text>
          ) : null}

          <View className="gap-3">
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("settings.testConnection")}
              onPress={() => void onTestConnection()}
              disabled={testing || saving || !ready}
              variant="outline"
              className="w-full"
            >
              <Text>
                {testing ? t("settings.testingConnection") : t("settings.testConnection")}
              </Text>
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
    </SafeAreaView>
  );
}
