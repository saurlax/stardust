import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { t } from "@/lib/i18n";
import { memoryTreeMock } from "@/lib/memoryTreeMock";
import { THEME } from "@/lib/theme";

export default function MemoryScreen() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: t("memory.title"),
          headerTintColor: THEME[colorScheme].foreground,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => null,
          headerShadowVisible: false,
        }}
      />
      <NebulaView style={{ flex: 1 }} tree={memoryTreeMock} showLabels interactive />
    </SafeAreaView>
  );
}
