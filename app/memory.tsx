import { Stack } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { theme } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function MemoryScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: t("memory.title"),
          headerTintColor: theme.colors.text,
          headerTitleStyle: styles.headerTitle,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => null,
          headerShadowVisible: false,
        }}
      />
      <NebulaView style={styles.nebulaView} />
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
  headerTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
});
