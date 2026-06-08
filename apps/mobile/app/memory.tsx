import { Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { buildMemoryTree, listStoredMemories } from "@/lib/db";
import { t } from "@/lib/i18n";
import { THEME } from "@/lib/theme";

export default function MemoryScreen() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const [memoryTree, setMemoryTree] = useState(buildMemoryTree([]));

  useFocusEffect(
    useCallback(() => {
      let active = true;

      listStoredMemories(db)
        .then((memories) => {
          if (!active) return;
          setMemoryTree(buildMemoryTree(memories));
        })
        .catch(() => {
          if (!active) return;
          setMemoryTree(buildMemoryTree([]));
        });

      return () => {
        active = false;
      };
    }, [db]),
  );

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
      <NebulaView style={{ flex: 1 }} tree={memoryTree} showLabels interactive />
    </SafeAreaView>
  );
}
