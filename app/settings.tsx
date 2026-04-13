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

import { useConfig } from "../context/config";
import { type AiConfig, createDefaultAiConfig } from "../lib/config";

const ProviderField = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.input, styles.readOnlyField]}>
      <Text style={styles.readOnlyText}>{value}</Text>
    </View>
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
      setMessage("Saved locally.");
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    const defaults = createDefaultAiConfig();
    setForm(defaults);
    await resetConfig();
    setMessage("Reset to defaults.");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Settings",
          headerShown: true,
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save settings"
              hitSlop={10}
              onPress={onSave}
              disabled={saving || !ready}
              style={styles.headerSaveButton}
            >
              <Text style={styles.headerSaveButtonText}>
                {saving ? "Saving" : "Save"}
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
          <Text style={styles.description}>
            Configure the local OpenAI-compatible provider used by the chat
            screen.
          </Text>

          <ProviderField label="Provider" value="openai-compact" />

          <View style={styles.field}>
            <Text style={styles.label}>Base URL</Text>
            <TextInput
              value={form.baseURL}
              onChangeText={(value) => updateField("baseURL", value)}
              placeholder="https://api.openai.com/v1"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>API key</Text>
            <TextInput
              value={form.apiKey}
              onChangeText={(value) => updateField("apiKey", value)}
              placeholder="sk-..."
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Model</Text>
            <TextInput
              value={form.model}
              onChangeText={(value) => updateField("model", value)}
              placeholder="gpt-4o-mini"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Temperature</Text>
            <TextInput
              value={form.temperature}
              onChangeText={(value) => updateField("temperature", value)}
              placeholder="0.7"
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
            accessibilityLabel="Reset settings"
            onPress={onReset}
            style={styles.resetButton}
          >
            <Text style={styles.resetButtonText}>Reset to defaults</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  headerSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerSaveButtonText: { color: "#111827", fontWeight: "600" },
  content: {
    padding: 16,
    gap: 14,
  },
  description: { color: "#6B7280", fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#111827" },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
  },
  readOnlyField: {
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  readOnlyText: { color: "#6B7280", fontSize: 15 },
  message: {
    color: "#065F46",
    fontSize: 13,
    fontWeight: "600",
  },
  resetButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
  },
  resetButtonText: { color: "#991B1B", fontWeight: "600" },
});
