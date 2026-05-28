import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useConfig } from "@/context/config";
import { createDefaultAiConfig, type AiConfig } from "@/lib/config";
import { t } from "@/lib/i18n";

type SettingsFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
};

function SettingsField({ label, id, ...props }: SettingsFieldProps) {
  const fieldId = id ?? label;

  return (
    <View className="gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} {...props} />
    </View>
  );
}

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

          <SettingsField
            label={t("settings.apiBaseURL")}
            value={form.apiBaseURL}
            onChangeText={(value) => updateField("apiBaseURL", value)}
            placeholder={t("settings.apiBaseURLPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {message ? (
            <Text className="text-sm font-semibold text-green-600">
              {message}
            </Text>
          ) : null}

          <Button
            accessibilityRole="button"
            accessibilityLabel={t("settings.saveSettings")}
            onPress={onSave}
            disabled={saving || !ready}
            className="mt-1 w-full"
          >
            <Text>{saving ? t("settings.saving") : t("settings.save")}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
