import { Drawer } from "expo-router/drawer";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettingsContent } from "@/components/SettingsContent";
import { t } from "@/lib/i18n";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen
        options={{
          title: t("settings.title"),
          headerShown: true,
          headerShadowVisible: false,
        }}
      />

      <SettingsContent />
    </SafeAreaView>
  );
}
