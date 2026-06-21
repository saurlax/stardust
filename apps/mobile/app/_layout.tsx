import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { router } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import { ShareIntentProvider } from "expo-share-intent";
import { SQLiteProvider } from "expo-sqlite";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { NebulaView } from "@/components/NebulaView";
import { PersonalDrawerContent } from "@/components/PersonalDrawerContent";
import { DeviceSubscriptionRestorer } from "@/components/DeviceSubscriptionRestorer";
import { ConfigProvider } from "@/context/config";
import { DATABASE_NAME, migrateDbIfNeeded } from "@/lib/db";
import { NAV_THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "../global.css";
import "@/lib/i18n";

function HeaderBackButton({ color }: { color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }

        router.replace("/");
      }}
      className="ml-3 h-10 w-10 items-center justify-center rounded-full"
    >
      <Ionicons name="chevron-back" size={24} color={color} />
    </Pressable>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const navTheme = NAV_THEME[colorScheme];
  const detailScreenOptions = {
    headerLeft: () => <HeaderBackButton color={navTheme.colors.text} />,
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <ShareIntentProvider options={{ resetOnBackground: true }}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
          <ConfigProvider>
            <DeviceSubscriptionRestorer />
            <ThemeProvider value={navTheme}>
              <View className={cn("flex-1 bg-background", colorScheme === "dark" && "dark")}>
                <NebulaView style={styles.background} />
                <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
                <Drawer
                  drawerContent={(props) => <PersonalDrawerContent {...props} />}
                  screenOptions={{
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: navTheme.colors.card },
                    headerTintColor: navTheme.colors.text,
                    headerTitleStyle: { color: navTheme.colors.text },
                    drawerPosition: "left",
                    drawerType: "front",
                    drawerStyle: {
                      backgroundColor: navTheme.colors.card,
                      width: 296,
                    },
                    overlayColor: colorScheme === "dark" ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.28)",
                    swipeEdgeWidth: 64,
                  }}
                >
                  <Drawer.Screen name="index" options={{ headerShown: false }} />
                  <Drawer.Screen name="inbox" options={detailScreenOptions} />
                  <Drawer.Screen
                    name="settings"
                    options={{
                      ...detailScreenOptions,
                      drawerItemStyle: { display: "none" },
                      swipeEnabled: false,
                    }}
                  />
                  <Drawer.Screen name="memory" options={detailScreenOptions} />
                  <Drawer.Screen name="journal" options={detailScreenOptions} />
                  <Drawer.Screen name="calendar" options={detailScreenOptions} />
                  <Drawer.Screen
                    name="personal"
                    options={{
                      ...detailScreenOptions,
                      drawerItemStyle: { display: "none" },
                      swipeEnabled: false,
                    }}
                  />
                </Drawer>
                <PortalHost />
              </View>
            </ThemeProvider>
          </ConfigProvider>
        </SQLiteProvider>
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
