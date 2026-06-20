import { Ionicons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  buildMemoryTree,
  getPersonalSnapshot,
  listEntities,
  listJournalRecords,
  listReflections,
  listRelations,
  listStoredMemories,
  type JournalRecord,
  type PersonalSnapshot,
  type StoredMemory,
} from "@/lib/db";
import { t } from "@/lib/i18n";

const emptySnapshot: PersonalSnapshot = {
  acceptedMemories: 0,
  pendingCards: 0,
  journalEntries: 0,
  episodeCount: 0,
  reflectionCount: 0,
  deviceCount: 0,
};

const navigateFromDrawer = (navigation: DrawerContentComponentProps["navigation"], href: Href) => {
  navigation.closeDrawer();
  router.push(href);
};

export function PersonalDrawerContent({ navigation }: DrawerContentComponentProps) {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const avatarIconColor = colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA";
  const [snapshot, setSnapshot] = useState<PersonalSnapshot>(emptySnapshot);
  const [memoryTree, setMemoryTree] = useState(buildMemoryTree([]));
  const [recentMemories, setRecentMemories] = useState<StoredMemory[]>([]);
  const [recentJournals, setRecentJournals] = useState<JournalRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      Promise.all([
        getPersonalSnapshot(db),
        listStoredMemories(db),
        listJournalRecords(db),
        listReflections(db),
        listEntities(db),
        listRelations(db),
      ])
        .then(([nextSnapshot, memories, journals, reflections, entities, relations]) => {
          if (!active) return;
          setSnapshot(nextSnapshot);
          setMemoryTree(buildMemoryTree(memories, reflections, entities, relations));
          setRecentMemories(memories.slice(0, 3));
          setRecentJournals(journals.slice(0, 3));
        })
        .catch(() => {
          if (!active) return;
          setSnapshot(emptySnapshot);
          setMemoryTree(buildMemoryTree([]));
          setRecentMemories([]);
          setRecentJournals([]);
        });

      return () => {
        active = false;
      };
    }, [db]),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-2.5 px-0.5 py-0.5">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
            <Ionicons name="person" size={20} color={avatarIconColor} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-base font-semibold">{t("personal.profileName")}</Text>
            <Text className="text-xs text-muted-foreground">{t("personal.profileSubtitle")}</Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          <Card className="flex-1 gap-2 px-3 py-3">
            <CardDescription>{t("personal.acceptedMemories")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.acceptedMemories}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-3 py-3">
            <CardDescription>{t("personal.pendingCards")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.pendingCards}</Text>
          </Card>
        </View>

        <Card className="gap-2 px-3 py-3">
          <CardDescription>{t("personal.episodeCount")}</CardDescription>
          <Text className="text-2xl font-semibold">{snapshot.episodeCount}</Text>
        </Card>

        <Card className="gap-2 px-4 py-4">
          <CardDescription>{t("personal.latestMemory")}</CardDescription>
          <Text className="text-sm leading-5">
            {snapshot.recentMemory?.content ?? t("personal.noLatestMemory")}
          </Text>
        </Card>

        <Card className="gap-3 px-4 py-4">
          <View className="gap-1">
            <Text className="text-base font-semibold">{t("personal.recentMemoriesTitle")}</Text>
            <Text className="text-xs text-muted-foreground">
              {t("personal.recentMemoriesDescription")}
            </Text>
          </View>
          {recentMemories.length ? (
            recentMemories.map((memory) => (
              <View key={memory.id} className="gap-1 rounded-lg bg-muted/50 px-3 py-3">
                <Text className="text-xs uppercase text-muted-foreground">{memory.type}</Text>
                <Text className="text-sm leading-5">{memory.content}</Text>
              </View>
            ))
          ) : (
            <Text className="text-sm text-muted-foreground">{t("personal.noRecentMemories")}</Text>
          )}
        </Card>

        <Card className="gap-3 px-4 py-4">
          <View className="gap-1">
            <Text className="text-base font-semibold">{t("personal.recentCapturesTitle")}</Text>
            <Text className="text-xs text-muted-foreground">
              {t("personal.recentCapturesDescription")}
            </Text>
          </View>
          {recentJournals.length ? (
            recentJournals.map((journal) => (
              <View key={journal.id} className="gap-1 rounded-lg bg-muted/50 px-3 py-3">
                <Text className="text-sm leading-5">{journal.content}</Text>
              </View>
            ))
          ) : (
            <Text className="text-sm text-muted-foreground">{t("personal.noRecentCaptures")}</Text>
          )}
        </Card>

        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => navigateFromDrawer(navigation, "/inbox" as Href)}
            className="rounded-xl"
          >
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.inboxTitle")}</CardTitle>
                <CardDescription>{t("personal.inboxDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigateFromDrawer(navigation, "/memory")}
            className="rounded-xl"
          >
            <Card className="h-48 overflow-hidden p-0">
              <NebulaView style={StyleSheet.absoluteFillObject} tree={memoryTree} showLabels={false} />
              <CardHeader className="absolute left-0 top-0 p-4">
                <CardTitle>{t("personal.memoryTitle")}</CardTitle>
                <CardDescription>{t("personal.memoryDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigateFromDrawer(navigation, "/journal")}
            className="rounded-xl"
          >
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.journalTitle")}</CardTitle>
                <CardDescription>{t("personal.journalDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigateFromDrawer(navigation, "/calendar")}
            className="rounded-xl"
          >
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.calendarTitle")}</CardTitle>
                <CardDescription>{t("personal.calendarDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 24,
  },
});
