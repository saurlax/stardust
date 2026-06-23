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
import { t } from "@/lib/i18n";
import { NAV_THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "../global.css";

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
  const drawerIconColor = ({ color, size }: { color: string; size: number }) => ({
    index: <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />,
    inbox: <Ionicons name="file-tray-full-outline" size={size} color={color} />,
    memory: <Ionicons name="git-network-outline" size={size} color={color} />,
    journal: <Ionicons name="journal-outline" size={size} color={color} />,
    calendar: <Ionicons name="calendar-outline" size={size} color={color} />,
  });

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
                  <Drawer.Screen
                    name="index"
                    options={{
                      headerShown: false,
                      drawerLabel: t("navigation.chat"),
                      drawerIcon: (props) => drawerIconColor(props).index,
                    }}
                  />
                  <Drawer.Screen
                    name="inbox"
                    options={{
                      ...detailScreenOptions,
                      drawerLabel: t("navigation.inbox"),
                      drawerIcon: (props) => drawerIconColor(props).inbox,
                    }}
                  />
                  <Drawer.Screen
                    name="settings"
                    options={{
                      ...detailScreenOptions,
                      drawerItemStyle: { display: "none" },
                      swipeEnabled: false,
                    }}
                  />
                  <Drawer.Screen
                    name="memory"
                    options={{
                      ...detailScreenOptions,
                      drawerLabel: t("navigation.memory"),
                      drawerIcon: (props) => drawerIconColor(props).memory,
                    }}
                  />
                  <Drawer.Screen
                    name="journal"
                    options={{
                      ...detailScreenOptions,
                      drawerLabel: t("navigation.journal"),
                      drawerIcon: (props) => drawerIconColor(props).journal,
                    }}
                  />
                  <Drawer.Screen
                    name="calendar"
                    options={{
                      ...detailScreenOptions,
                      drawerLabel: t("navigation.calendar"),
                      drawerIcon: (props) => drawerIconColor(props).calendar,
                    }}
                  />
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
