import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  buildMemoryTree,
  getPersonalSnapshot,
  listEntities,
  listEpisodes,
  listReflections,
  listRelations,
  listStoredMemories,
  type Episode,
  type PersonalSnapshot,
  type ReflectionRecord,
  type RelationRecord,
  type StoredMemory,
} from "@/lib/db";
import { t } from "@/lib/i18n";
import { getEpisodeTitleLabel, getMemoryTypeLabel, getRelationTypeLabel } from "@/lib/memoryLabels";

const emptySnapshot: PersonalSnapshot = {
  acceptedMemories: 0,
  pendingCards: 0,
  pendingDeviceReviewCount: 0,
  openLoopCount: 0,
  journalEntries: 0,
  episodeCount: 0,
  screenOffEpisodeCount: 0,
  reflectionCount: 0,
  entityCount: 0,
  relationCount: 0,
  deviceCount: 0,
};

const getEpisodeTitle = (episode: Episode) => {
  return getEpisodeTitleLabel(episode.source, episode.title);
};

const getMemorySummaryLabel = (memory: StoredMemory) =>
  [
    memory.candidateKind === "open_loop" ? getMemoryTypeLabel("open_loop") : getMemoryTypeLabel(memory.type),
    `${t("personal.importance")} ${memory.importance}`,
    memory.sourceKind === "iot" ? t("personal.screenOffEpisodeCount") : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

function EpisodeMediaPreview({ episode }: { episode: Episode }) {
  if (!episode.mediaUri) return null;

  return (
    <Image
      source={{ uri: episode.mediaUri }}
      resizeMode="cover"
      accessibilityLabel={getEpisodeTitle(episode) ?? t("journal.mediaPreview")}
      className="mt-1 h-24 w-full rounded-md bg-muted"
    />
  );
}

function ScreenOffBadge() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#67E8F9" : "#0E7490";

  return (
    <View className="self-start flex-row items-center gap-1.5 rounded-md border border-cyan-700/30 bg-cyan-700/10 px-2 py-1">
      <Ionicons name="radio-outline" size={13} color={iconColor} />
      <Text className="text-xs font-semibold text-cyan-700 dark:text-cyan-200">
        {t("personal.screenOffSource")}
      </Text>
    </View>
  );
}

export default function PersonalScreen() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const avatarIconColor = colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA";
  const [snapshot, setSnapshot] = useState<PersonalSnapshot>(emptySnapshot);
  const [memoryTree, setMemoryTree] = useState(buildMemoryTree([]));
  const [recentMemories, setRecentMemories] = useState<StoredMemory[]>([]);
  const [recentReflections, setRecentReflections] = useState<ReflectionRecord[]>([]);
  const [recentRelations, setRecentRelations] = useState<RelationRecord[]>([]);
  const [recentEpisodes, setRecentEpisodes] = useState<Episode[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      Promise.all([
        getPersonalSnapshot(db),
        listStoredMemories(db),
        listEpisodes(db, 3),
        listReflections(db),
        listEntities(db),
        listRelations(db),
      ])
        .then(([nextSnapshot, memories, episodes, reflections, entities, relations]) => {
          if (!active) return;
          setSnapshot(nextSnapshot);
          setMemoryTree(buildMemoryTree(memories, reflections, entities, relations));
          setRecentMemories(memories.slice(0, 3));
          setRecentReflections(reflections.slice(0, 2));
          setRecentRelations(relations.slice(0, 3));
          setRecentEpisodes(episodes);
        })
        .catch(() => {
          if (!active) return;
          setSnapshot(emptySnapshot);
          setMemoryTree(buildMemoryTree([]));
          setRecentMemories([]);
          setRecentReflections([]);
          setRecentRelations([]);
          setRecentEpisodes([]);
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <CardDescription>{t("personal.openLoops")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.openLoopCount}</Text>
          </Card>
        </View>

        <View className="flex-row gap-3">
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.episodeCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.episodeCount}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.screenOffEpisodeCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.screenOffEpisodeCount}</Text>
          </Card>
          <Pressable
            accessibilityRole="button"
            className="flex-1"
            onPress={() => router.push("/inbox?tab=devices" as Href)}
          >
            <Card className="gap-2 px-4 py-4">
              <CardDescription>{t("personal.pendingDeviceReviews")}</CardDescription>
              <Text className="text-2xl font-semibold">{snapshot.pendingDeviceReviewCount}</Text>
            </Card>
          </Pressable>
        </View>

        <View className="flex-row gap-3">
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.reflectionCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.reflectionCount}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.entityCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.entityCount}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.relationCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.relationCount}</Text>
          </Card>
        </View>

        <View className="flex-row gap-3">
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.journalCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.journalEntries}</Text>
          </Card>
          <Card className="flex-1 gap-2 px-4 py-4">
            <CardDescription>{t("personal.deviceCount")}</CardDescription>
            <Text className="text-2xl font-semibold">{snapshot.deviceCount}</Text>
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
                <Pressable
                  key={memory.id}
                  accessibilityRole="button"
                  className="gap-1 rounded-lg bg-muted/50 px-3 py-3"
                  onPress={() =>
                    router.push({
                      pathname: "/memory",
                      params: { nodeId: `memory-${memory.id}` },
                    } as Href)
                  }
                >
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    {getMemorySummaryLabel(memory)}
                  </Text>
                  {memory.sourceKind === "iot" ? <ScreenOffBadge /> : null}
                  <Text className="text-sm leading-5">{memory.content}</Text>
                  {memory.rationale ? (
                    <Text className="text-xs leading-4 text-muted-foreground">{memory.rationale}</Text>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text className="text-sm text-muted-foreground">{t("personal.noRecentMemories")}</Text>
            )}
          </Card>

          <Card className="gap-3 px-4 py-4">
            <View className="gap-1">
              <Text className="text-base font-semibold">{t("personal.recentRelationsTitle")}</Text>
              <Text className="text-xs text-muted-foreground">
                {t("personal.recentRelationsDescription")}
              </Text>
            </View>
            {recentRelations.length ? (
              recentRelations.map((relation) => (
                <Pressable
                  key={relation.id}
                  accessibilityRole="button"
                  className="gap-1 rounded-lg bg-muted/50 px-3 py-3"
                  onPress={() =>
                    router.push({
                      pathname: "/memory",
                      params: { nodeId: `relation-${relation.id}` },
                    } as Href)
                  }
                >
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    {getRelationTypeLabel(relation.type)} · {t("memory.relationWeight")} {relation.weight}
                  </Text>
                  {relation.sourceKind === "iot" ? <ScreenOffBadge /> : null}
                  <Text className="text-sm leading-5">
                    {relation.sourceEntityName ?? relation.sourceEntityId} ·{" "}
                    {getRelationTypeLabel(relation.type)} ·{" "}
                    {relation.targetEntityName ?? relation.targetEntityId}
                  </Text>
                  {relation.rationale ? (
                    <Text className="text-xs leading-4 text-muted-foreground">{relation.rationale}</Text>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text className="text-sm text-muted-foreground">{t("personal.noRecentRelations")}</Text>
            )}
          </Card>

          <Card className="gap-3 px-4 py-4">
            <View className="gap-1">
              <Text className="text-base font-semibold">{t("personal.recentReflectionsTitle")}</Text>
              <Text className="text-xs text-muted-foreground">
                {t("personal.recentReflectionsDescription")}
              </Text>
            </View>
            {recentReflections.length ? (
              recentReflections.map((reflection) => (
                <Pressable
                  key={reflection.id}
                  accessibilityRole="button"
                  className="gap-1 rounded-lg bg-muted/50 px-3 py-3"
                  onPress={() =>
                    router.push({
                      pathname: "/memory",
                      params: { nodeId: `reflection-${reflection.id}` },
                    } as Href)
                  }
                >
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    {new Date(reflection.createdAt).toLocaleDateString()}
                  </Text>
                  <Text className="text-sm font-semibold leading-5">{reflection.title}</Text>
                  <Text className="text-sm leading-5">{reflection.content}</Text>
                  {reflection.rationale ? (
                    <Text className="text-xs leading-4 text-muted-foreground">{reflection.rationale}</Text>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text className="text-sm text-muted-foreground">{t("personal.noRecentReflections")}</Text>
            )}
          </Card>

          <Card className="gap-3 px-4 py-4">
            <View className="gap-1">
              <Text className="text-base font-semibold">{t("personal.recentCapturesTitle")}</Text>
              <Text className="text-xs text-muted-foreground">
                {t("personal.recentCapturesDescription")}
              </Text>
            </View>
            {recentEpisodes.length ? (
              recentEpisodes.map((episode) => (
                <Pressable
                  key={episode.id}
                  accessibilityRole="button"
                  className="gap-1 rounded-lg bg-muted/50 px-3 py-3"
                  onPress={() =>
                    router.push({
                      pathname: "/journal",
                      params: { episodeId: episode.id },
                    } as Href)
                  }
                >
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t(`journal.source.${episode.source}`)}
                  </Text>
                  {getEpisodeTitle(episode) ? (
                    <Text className="text-sm font-semibold leading-5">
                      {getEpisodeTitle(episode)}
                    </Text>
                  ) : null}
                  <EpisodeMediaPreview episode={episode} />
                  <Text className="text-sm leading-5">{episode.content}</Text>
                </Pressable>
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/inbox?tab=devices" as Href)}
            className="rounded-xl"
          >
            <Card>
              <CardHeader>
                <CardTitle>{t("personal.deviceInboxTitle")}</CardTitle>
                <CardDescription>{t("personal.deviceInboxDescription")}</CardDescription>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 28,
  },
});
