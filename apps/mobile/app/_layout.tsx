import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StyleSheet, useColorScheme, View } from "react-native";
import { ShareIntentProvider } from "expo-share-intent";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { NebulaView } from "@/components/NebulaView";
import { ConfigProvider } from "@/context/config";
import { NAV_THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "../global.css";
import "@/lib/i18n";

export default function RootLayout() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const navTheme = NAV_THEME[colorScheme];

  return (
    <GestureHandlerRootView style={styles.root}>
      <ShareIntentProvider options={{ resetOnBackground: true }}>
        <ConfigProvider>
          <ThemeProvider value={navTheme}>
            <View className={cn("flex-1 bg-background", colorScheme === "dark" && "dark")}>
              <NebulaView style={styles.background} />
              <Stack
                screenOptions={{
                  headerShadowVisible: false,
                  statusBarStyle: colorScheme === "dark" ? "light" : "dark",
                  headerStyle: { backgroundColor: navTheme.colors.card },
                  headerTintColor: navTheme.colors.text,
                  headerTitleStyle: { color: navTheme.colors.text },
                }}
              />
              <PortalHost />
            </View>
          </ThemeProvider>
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
