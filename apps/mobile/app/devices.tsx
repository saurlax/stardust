import { Drawer } from "expo-router/drawer";
import { SafeAreaView } from "react-native-safe-area-context";

import { DevicesContent } from "@/components/DevicesContent";
import { t } from "@/lib/i18n";

export default function DevicesScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen
        options={{
          title: t("devices.title"),
          headerShown: true,
          headerShadowVisible: false,
        }}
      />

      <DevicesContent />
    </SafeAreaView>
  );
}
