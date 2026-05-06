import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { useConfig } from "@/context/config";
import { type AiConfig, createDefaultAiConfig } from "@/lib/config";
import { t } from "@/lib/i18n";
import { theme, ui } from "@/lib/theme";

const ProviderField = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Card style={[styles.input, styles.readOnlyField]}>
      <Text style={styles.readOnlyText}>{value}</Text>
    </Card>
  </View>
);

export default function SettingsScreen() {
  const { config, ready, updateConfig, resetConfig } = useConfig();
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

  const onReset = async () => {
    const defaults = createDefaultAiConfig();
    setForm(defaults);
    await resetConfig();
    setMessage(t("settings.reset"));
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("settings.title"),
          headerShown: true,
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("settings.saveSettings")}
              hitSlop={10}
              onPress={onSave}
              disabled={saving || !ready}
              style={styles.headerSaveButton}
            >
              <Text style={styles.headerSaveButtonText}>
                {saving ? t("settings.saving") : t("settings.save")}
              </Text>
            </Pressable>
          ),
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

          <ProviderField
            label={t("settings.provider")}
            value={t("settings.providerValue")}
          />

          <View style={styles.field}>
            <Text style={styles.label}>{t("settings.baseURL")}</Text>
            <TextInput
              value={form.baseURL}
              onChangeText={(value) => updateField("baseURL", value)}
              placeholder={t("settings.baseURLPlaceholder")}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("settings.apiKey")}</Text>
            <TextInput
              value={form.apiKey}
              onChangeText={(value) => updateField("apiKey", value)}
              placeholder={t("settings.apiKeyPlaceholder")}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("settings.model")}</Text>
            <TextInput
              value={form.model}
              onChangeText={(value) => updateField("model", value)}
              placeholder={t("settings.modelPlaceholder")}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("settings.temperature")}</Text>
            <TextInput
              value={form.temperature}
              onChangeText={(value) => updateField("temperature", value)}
              placeholder={t("settings.temperaturePlaceholder")}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              keyboardType="decimal-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("settings.resetSettings")}
            onPress={onReset}
            style={styles.resetButton}
          >
            <Text style={styles.resetButtonText}>
              {t("settings.resetButton")}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: ui.screen,
  headerSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerSaveButtonText: { color: theme.colors.text, fontWeight: "600" },
  content: {
    padding: 16,
    gap: 14,
  },
  description: ui.description,
  field: { gap: 6 },
  label: ui.label,
  input: {
    ...ui.input,
  },
  readOnlyField: {
    ...ui.readOnlyInput,
  },
  readOnlyText: { color: theme.colors.textMuted, fontSize: 15 },
  message: {
    color: theme.colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  resetButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.dangerSoft,
  },
  resetButtonText: { color: theme.colors.danger, fontWeight: "600" },
});
