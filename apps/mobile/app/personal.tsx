import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";
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

export default function PersonalScreen() {
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
      ])
        .then(([nextSnapshot, memories, journals, reflections, entities]) => {
          if (!active) return;
          setSnapshot(nextSnapshot);
          setMemoryTree(buildMemoryTree(memories, reflections, entities));
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
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen
        options={{
          title: t("personal.title"),
        }}
      />

      <View className="flex-1 gap-4 p-4">
        <View className="flex-row items-center gap-2.5 px-0.5 py-0.5">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
            <Ionicons name="person" size={20} color={avatarIconColor} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-base font-semibold">{t("personal.profileName")}</Text>
            <Text className="text-xs text-muted-foreground">{t("personal.profileSubtitle")}</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.acceptedMemories")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.acceptedMemories}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.pendingCards")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.pendingCards}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.episodeCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.episodeCount}</Text>
          </Card>
        </View>

        <Card className="gap-2 px-4 py-4">
          <CardDescription>{t("personal.latestMemory")}</CardDescription>
          <Text className="text-sm leading-5">
            {snapshot.recentMemory?.content ?? t("personal.noLatestMemory")}
          </Text>
        </Card>

        <View className="gap-3">
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
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    {memory.type}
                  </Text>
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
        </View>

        <View className="gap-3">
          <Pressable accessibilityRole="button" onPress={() => router.push("/inbox" as Href)} className="rounded-xl">
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.inboxTitle")}</CardTitle>
                <CardDescription>{t("personal.inboxDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push("/memory")} className="rounded-xl">
            <Card className="h-56 overflow-hidden p-0">
              <NebulaView style={StyleSheet.absoluteFillObject} tree={memoryTree} showLabels={false} />
              <CardHeader className="absolute left-0 top-0 p-4">
                <CardTitle>{t("personal.memoryTitle")}</CardTitle>
                <CardDescription>{t("personal.memoryDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push("/journal")} className="rounded-xl">
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.journalTitle")}</CardTitle>
                <CardDescription>{t("personal.journalDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push("/calendar")} className="rounded-xl">
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.calendarTitle")}</CardTitle>
                <CardDescription>{t("personal.calendarDescription")}</CardDescription>
              </CardHeader>
            </Card>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
