import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { NebulaView } from "@/components/NebulaView";
import { theme } from "@/components/ui";
import { ConfigProvider } from "@/context/config";
import "@/lib/i18n";

export default function RootLayout() {
  return (
    <ConfigProvider>
      <View style={styles.root}>
        <NebulaView style={styles.background} />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            statusBarStyle: theme.isDark ? "light" : "dark",
            headerStyle: { backgroundColor: theme.colors.surfaceOverlay },
            headerTintColor: theme.colors.text,
            headerTitleStyle: { color: theme.colors.text },
          }}
        />
      </View>
    </ConfigProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  background: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
});
