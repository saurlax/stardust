import { Stack } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { t } from "@/lib/i18n";
import { theme } from "@/components/ui";

export default function MemoryScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: t("memory.title"),
          headerTitleStyle: styles.headerTitle,
          headerTintColor: theme.colors.textOnDark,
          statusBarStyle: "light",
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
    color: theme.colors.textOnDark,
    fontSize: 16,
    fontWeight: "600",
  },
});
