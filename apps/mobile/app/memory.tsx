import { Stack } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { theme } from "@/components/ui";
import { t } from "@/lib/i18n";
import { memoryTreeMock } from "@/lib/memoryTreeMock";

export default function MemoryScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: t("memory.title"),
          headerTintColor: theme.colors.text,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => null,
          headerShadowVisible: false,
        }}
      />
      <NebulaView style={styles.nebulaView} tree={memoryTreeMock} showLabels interactive />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  nebulaView: {
    flex: 1,
  },
});
