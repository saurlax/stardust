import { Stack } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { ShareIntentProvider } from "expo-share-intent";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { NebulaView } from "@/components/NebulaView";
import { theme } from "@/components/ui";
import { ConfigProvider } from "@/context/config";
import "@/lib/i18n";

export default function RootLayout() {
  const headerBackgroundColor =
    Platform.OS === "android" ? theme.colors.background : theme.colors.surfaceOverlay;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ShareIntentProvider options={{ resetOnBackground: true }}>
        <ConfigProvider>
          <View style={styles.root}>
            <NebulaView style={styles.background} />
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                statusBarStyle: theme.isDark ? "light" : "dark",
                headerStyle: { backgroundColor: headerBackgroundColor },
                headerTintColor: theme.colors.text,
                headerTitleStyle: { color: theme.colors.text },
              }}
            />
          </View>
        </ConfigProvider>
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  background: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
});
