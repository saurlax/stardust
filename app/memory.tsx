import { Stack } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { t } from "@/lib/i18n";

export default function MemoryScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: t("memory.title"),
          headerTitleStyle: styles.headerTitle,
          headerTintColor: "#FFFFFF",
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
