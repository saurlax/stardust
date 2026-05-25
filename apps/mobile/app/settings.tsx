import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Input, theme, ui } from "@/components/ui";
import { useConfig } from "@/context/config";
import { createDefaultAiConfig, type AiConfig } from "@/lib/config";
import { t } from "@/lib/i18n";

export default function SettingsScreen() {
  const { config, ready, updateConfig } = useConfig();
  const [form, setForm] = useState<AiConfig>(createDefaultAiConfig());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ready) setForm(config);
  }, [config, ready]);

  const updateField = <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateConfig(form);
      setMessage(t("settings.saved"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("settings.title"),
          headerShown: true,
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.description}>{t("settings.description")}</Text>

          <Input
            label={t("settings.provider")}
            value={t("settings.providerValue")}
            readOnly
          />

          <Input
            label={t("settings.baseURL")}
            value={form.baseURL}
            onChangeText={(value) => updateField("baseURL", value)}
            placeholder={t("settings.baseURLPlaceholder")}
          />

          <Input
            label={t("settings.apiBaseURL")}
            value={form.apiBaseURL}
            onChangeText={(value) => updateField("apiBaseURL", value)}
            placeholder={t("settings.apiBaseURLPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label={t("settings.apiKey")}
            value={form.apiKey}
            onChangeText={(value) => updateField("apiKey", value)}
            placeholder={t("settings.apiKeyPlaceholder")}
            secureTextEntry
          />

          <Input
            label={t("settings.model")}
            value={form.model}
            onChangeText={(value) => updateField("model", value)}
            placeholder={t("settings.modelPlaceholder")}
          />

          <Input
            label={t("settings.temperature")}
            value={form.temperature}
            onChangeText={(value) => updateField("temperature", value)}
            placeholder={t("settings.temperaturePlaceholder")}
            keyboardType="decimal-pad"
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Button
            accessibilityRole="button"
            accessibilityLabel={t("settings.saveSettings")}
            onPress={onSave}
            disabled={saving || !ready}
            color="primary"
            variant="soft"
            block
            style={styles.saveButton}
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: ui.screen,
  content: {
    padding: 16,
    gap: 14,
  },
  description: ui.description,
  message: {
    color: theme.colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  saveButton: {
    marginTop: 6,
  },
});
