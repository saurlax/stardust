import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import {
  buildMemoryTree,
  dismissStoredMemory,
  listEntities,
  listReflections,
  listRelations,
  listStoredMemories,
  type EntityRecord,
  type RelationRecord,
  type ReflectionRecord,
  type StoredMemory,
  updateStoredMemoryContent,
} from "@/lib/db";
import { t } from "@/lib/i18n";
import {
  getEntityTypeLabel,
  getMemoryTypeLabel,
  getRelationTypeLabel,
} from "@/lib/memoryLabels";
import { THEME } from "@/lib/theme";

const filters = [
  "all",
  "open_loop",
  "preference",
  "fact",
  "relationship",
  "project",
  "concern",
  "goal",
  "routine",
  "memory",
  "task",
  "opinion",
] as const;
type Filter = (typeof filters)[number];

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("memory.actionFailed");
};

const getStoredMemoryTypeLabel = (memory: StoredMemory) =>
  memory.candidateKind === "open_loop"
    ? t("memory.filter.open_loop")
    : getMemoryTypeLabel(memory.type);

function FilterButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onPress={onPress}>
      <Text>{label}</Text>
    </Button>
  );
}

function OpenSourceButton({ episodeId }: { episodeId?: string }) {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";

  if (!episodeId) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-1 self-start"
      onPress={() =>
        router.push({
          pathname: "/journal",
          params: { episodeId },
        } as Href)
      }
    >
      <Ionicons name="open-outline" size={14} color={iconColor} />
      <Text>{t("memory.openSource")}</Text>
    </Button>
  );
}

function MemoryEditor({
  memory,
  onRefresh,
  onError,
}: {
  memory: StoredMemory;
  onRefresh: () => void;
  onError: (error: unknown) => void;
}) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        <CardDescription>
          {memory.candidateKind === "open_loop" ? `${t("memory.openLoopBadge")} · ` : ""}
          {getStoredMemoryTypeLabel(memory)} · {new Date(memory.createdAt).toLocaleDateString()}
        </CardDescription>
        {editing ? (
          <Textarea
            value={draft}
            onChangeText={setDraft}
            className="min-h-24 rounded-md bg-background"
          />
        ) : (
          <View className="gap-2">
            <CardTitle className="text-sm leading-5">{memory.content}</CardTitle>
            {memory.sourceContent ? (
              <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
                <Text className="text-xs font-semibold uppercase text-muted-foreground">
                  {t("memory.source")}
                </Text>
                <Text className="text-xs leading-4 text-muted-foreground">
                  {memory.sourceTitle ? `${memory.sourceTitle} · ` : ""}
                  {memory.sourceContent}
                </Text>
                <OpenSourceButton episodeId={memory.episodeId} />
              </View>
            ) : null}
          </View>
        )}
      </CardHeader>
      <CardContent className="flex-row flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                setEditing(false);
                setDraft(memory.content);
              }}
            >
              <Text>{t("memory.cancel")}</Text>
            </Button>
            <Button
              size="sm"
              onPress={() => {
                void updateStoredMemoryContent(db, memory.id, draft)
                  .then(() => {
                    setEditing(false);
                    onRefresh();
                  })
                  .catch(onError);
              }}
            >
              <Text>{t("memory.save")}</Text>
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
              <Text>{t("memory.edit")}</Text>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                void dismissStoredMemory(db, memory.id).then(onRefresh).catch(onError);
              }}
            >
              <Text>{t("memory.archive")}</Text>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function MemoryScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ nodeId?: string }>();
  const targetNodeId = typeof params.nodeId === "string" ? params.nodeId : undefined;
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [reflections, setReflections] = useState<ReflectionRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("root");
  const [graphResetToken, setGraphResetToken] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    Promise.all([listStoredMemories(db), listReflections(db), listEntities(db), listRelations(db)])
      .then(([nextMemories, nextReflections, nextEntities, nextRelations]) => {
        if (!active) return;
        setErrorMessage(null);
        setMemories(nextMemories);
        setReflections(nextReflections);
        setEntities(nextEntities);
        setRelations(nextRelations);
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage(t("memory.loadFailed"));
        setMemories([]);
        setReflections([]);
        setEntities([]);
        setRelations([]);
      });

    return () => {
      active = false;
    };
  }, [db]);

  const handleMemoryError = useCallback((error: unknown) => {
    setErrorMessage(getErrorMessage(error));
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    if (!targetNodeId) return;
    setFilter("all");
    setSelectedNodeId(targetNodeId);
  }, [targetNodeId]);

  const visibleMemories = useMemo(
    () =>
      filter === "all"
        ? memories
        : filter === "open_loop"
          ? memories.filter((memory) => memory.candidateKind === "open_loop")
          : memories.filter((memory) => memory.type === filter),
    [filter, memories],
  );
  const openLoopCount = useMemo(
    () => memories.filter((memory) => memory.candidateKind === "open_loop").length,
    [memories],
  );
  const filterCounts = useMemo(
    () =>
      filters.reduce<Record<Filter, number>>(
        (counts, item) => {
          counts[item] =
            item === "all"
              ? memories.length
              : item === "open_loop"
                ? memories.filter((memory) => memory.candidateKind === "open_loop").length
                : memories.filter((memory) => memory.type === item).length;
          return counts;
        },
        {
          all: 0,
          open_loop: 0,
          preference: 0,
          fact: 0,
          relationship: 0,
          project: 0,
          concern: 0,
          goal: 0,
          routine: 0,
          memory: 0,
          task: 0,
          opinion: 0,
        },
      ),
    [memories],
  );
  const memoryTree = useMemo(
    () =>
      buildMemoryTree(visibleMemories, reflections, entities, relations, {
        rootTitle: t("memory.rootNodeTitle"),
        memoryTypeLabel: getMemoryTypeLabel,
        relationTypeLabel: getRelationTypeLabel,
      }),
    [entities, reflections, relations, visibleMemories],
  );
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || selectedNodeId === "root") {
      return {
        title: t("memory.rootNodeTitle"),
        description: t("memory.rootNodeDescription"),
        content: t("memory.rootNodeContent"),
      };
    }

    if (selectedNodeId.startsWith("type-")) {
      const type = selectedNodeId.replace("type-", "");
      return {
        title: t(`memory.filter.${type}`),
        description: t("memory.typeNodeDescription"),
        content: visibleMemories
          .filter((memory) => memory.type === type)
          .slice(0, 3)
          .map((memory) => memory.content)
          .join("\n"),
      };
    }

    const memory = visibleMemories.find((item) => `memory-${item.id}` === selectedNodeId);
    if (memory) {
      return {
        title:
          memory.candidateKind === "open_loop"
            ? t("memory.filter.open_loop")
            : getMemoryTypeLabel(memory.type),
        description: t("memory.memoryNodeDescription"),
        content: memory.content,
        source: memory.sourceContent,
        sourceEpisodeId: memory.episodeId,
      };
    }

    const reflection = reflections.find((item) => `reflection-${item.id}` === selectedNodeId);
    if (reflection) {
      return {
        title: reflection.title,
        description: t("memory.reflectionNodeDescription"),
        content: reflection.content,
        source: reflection.sourceContent,
        sourceEpisodeId: reflection.episodeId,
      };
    }

    const entity = entities.find((item) => `entity-${item.id}` === selectedNodeId);
    if (entity) {
      const related = relations.filter(
        (relation) => relation.sourceEntityId === entity.id || relation.targetEntityId === entity.id,
      );
      const relationSource = related.find((relation) => relation.sourceContent);
      const relationLines = related.map((relation) => {
        const isSource = relation.sourceEntityId === entity.id;
        const peerName = isSource
          ? relation.targetEntityName ?? relation.targetEntityId
          : relation.sourceEntityName ?? relation.sourceEntityId;
        return `${peerName} · ${getRelationTypeLabel(relation.type)} · ${t("memory.relationWeight")} ${relation.weight}`;
      });
      return {
        title: entity.name,
        description: `${t("memory.entityNodeDescription")} · ${getEntityTypeLabel(entity.type)}`,
        content: relationLines.length ? relationLines.join("\n") : t("memory.entityNodeEmpty"),
        source: relationSource?.sourceContent,
        sourceEpisodeId: relationSource?.episodeId,
      };
    }

    const relation = relations.find((item) => `relation-${item.id}` === selectedNodeId);
    if (relation) {
      return {
        title: getRelationTypeLabel(relation.type),
        description: t("memory.relationNodeDescription"),
        content: `${relation.sourceEntityName ?? relation.sourceEntityId} · ${getRelationTypeLabel(relation.type)} · ${
          relation.targetEntityName ?? relation.targetEntityId
        }\n${t("memory.relationWeight")} ${relation.weight}`,
        source: relation.sourceContent,
        sourceEpisodeId: relation.episodeId,
      };
    }

    return null;
  }, [entities, reflections, relations, selectedNodeId, visibleMemories]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Drawer.Screen
        options={{
          headerTransparent: true,
          headerTitle: t("memory.title"),
          headerTintColor: THEME[colorScheme].foreground,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => null,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ height: 420 }}>
          <NebulaView
            style={{ flex: 1 }}
            tree={memoryTree}
            showLabels
            interactive
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            resetToken={graphResetToken}
          />
        </View>

        <View className="gap-4 px-4 pt-4">
          <View className="gap-2">
            <Text className="text-xl font-semibold">{t("memory.graphTitle")}</Text>
            <Text className="text-sm text-muted-foreground">{t("memory.graphSubtitle")}</Text>
          </View>

          {errorMessage ? (
            <Card className="gap-3 border-destructive/50 bg-destructive/5 p-4">
              <Text className="text-sm font-semibold text-destructive">
                {t("memory.errorTitle")}
              </Text>
              <Text className="text-sm text-destructive">{errorMessage}</Text>
              <Button variant="outline" size="sm" className="self-start" onPress={refresh}>
                <Ionicons name="refresh-outline" size={14} color={iconColor} />
                <Text>{t("memory.retry")}</Text>
              </Button>
            </Card>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {filters.map((item) => (
                <FilterButton
                  key={item}
                  active={filter === item}
                  label={`${t(`memory.filter.${item}`)} ${filterCounts[item]}`}
                  onPress={() => setFilter(item)}
                />
              ))}
            </View>
          </ScrollView>
          <Text className="px-0.5 text-xs text-muted-foreground">
            {filter === "all"
              ? `${memories.length} ${t("memory.visibleMemories")}`
              : `${visibleMemories.length} ${t("memory.visibleMemories")} · ${t(`memory.filter.${filter}`)}`}
          </Text>

          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onPress={() => {
              setSelectedNodeId("root");
              setGraphResetToken((value) => value + 1);
            }}
          >
            <Ionicons name="refresh-outline" size={14} color={iconColor} />
            <Text>{t("memory.resetView")}</Text>
          </Button>

          <View className="flex-row gap-2">
            <Card className="flex-1 px-3 py-3">
              <CardDescription>{t("memory.savedCount")}</CardDescription>
              <Text className="text-2xl font-semibold">{memories.length}</Text>
            </Card>
            <Card className="flex-1 px-3 py-3">
              <CardDescription>{t("memory.reflectionCount")}</CardDescription>
              <Text className="text-2xl font-semibold">{reflections.length}</Text>
            </Card>
            <Card className="flex-1 px-3 py-3">
              <CardDescription>{t("memory.entityCount")}</CardDescription>
              <Text className="text-2xl font-semibold">{entities.length}</Text>
            </Card>
          </View>

          <View className="flex-row gap-2">
            <Card className="flex-1 px-3 py-3">
              <CardDescription>{t("memory.openLoopCount")}</CardDescription>
              <Text className="text-2xl font-semibold">{openLoopCount}</Text>
            </Card>
            <Card className="flex-1 px-3 py-3">
              <CardDescription>{t("memory.relationCount")}</CardDescription>
              <Text className="text-2xl font-semibold">{relations.length}</Text>
            </Card>
          </View>

          {selectedNode ? (
            <Card className="gap-3 py-4">
              <CardHeader className="gap-1">
                <CardDescription>{selectedNode.description}</CardDescription>
                <CardTitle className="text-base">{selectedNode.title}</CardTitle>
              </CardHeader>
              <CardContent className="gap-2">
                <Text className="text-sm leading-5">{selectedNode.content || t("memory.nodeEmpty")}</Text>
                {"source" in selectedNode && selectedNode.source ? (
                  <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
                    <Text className="text-xs font-semibold uppercase text-muted-foreground">
                      {t("memory.source")}
                    </Text>
                    <Text className="text-xs leading-4 text-muted-foreground">
                      {selectedNode.source}
                    </Text>
                    <OpenSourceButton
                      episodeId={
                        "sourceEpisodeId" in selectedNode ? selectedNode.sourceEpisodeId : undefined
                      }
                    />
                  </View>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {reflections.length ? (
            <Card className="gap-3 py-4">
              <CardHeader className="gap-1">
                <CardDescription>{t("memory.reflectionsTitle")}</CardDescription>
                <CardTitle className="text-base">{reflections[0].title}</CardTitle>
              </CardHeader>
              <CardContent className="gap-2">
                <Text className="text-sm leading-5">{reflections[0].content}</Text>
              </CardContent>
            </Card>
          ) : null}

          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="albums-outline" size={18} color={iconColor} />
              <Text className="text-lg font-semibold">{t("memory.manageTitle")}</Text>
            </View>

            {!visibleMemories.length ? (
              <Card className="min-h-24 items-center justify-center px-4">
                <Text variant="muted">{t("memory.empty")}</Text>
              </Card>
            ) : null}

            {visibleMemories.map((memory) => (
              <MemoryEditor
                key={memory.id}
                memory={memory}
                onRefresh={refresh}
                onError={handleMemoryError}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
