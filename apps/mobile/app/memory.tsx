import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
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
import { THEME } from "@/lib/theme";

const filters = ["all", "preference", "project", "relationship", "concern", "goal"] as const;
type Filter = (typeof filters)[number];

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

function MemoryEditor({
  memory,
  onRefresh,
}: {
  memory: StoredMemory;
  onRefresh: () => void;
}) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        <CardDescription>
          {memory.type} · {new Date(memory.createdAt).toLocaleDateString()}
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
                void updateStoredMemoryContent(db, memory.id, draft).then(() => {
                  setEditing(false);
                  onRefresh();
                });
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
                void dismissStoredMemory(db, memory.id).then(onRefresh);
              }}
            >
              <Text>{t("memory.delete")}</Text>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function MemoryScreen() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [reflections, setReflections] = useState<ReflectionRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("root");

  const refresh = useCallback(() => {
    let active = true;

    Promise.all([listStoredMemories(db), listReflections(db), listEntities(db), listRelations(db)])
      .then(([nextMemories, nextReflections, nextEntities, nextRelations]) => {
        if (!active) return;
        setMemories(nextMemories);
        setReflections(nextReflections);
        setEntities(nextEntities);
        setRelations(nextRelations);
      })
      .catch(() => {
        if (!active) return;
        setMemories([]);
        setReflections([]);
        setEntities([]);
        setRelations([]);
      });

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const visibleMemories = useMemo(
    () => (filter === "all" ? memories : memories.filter((memory) => memory.type === filter)),
    [filter, memories],
  );
  const memoryTree = useMemo(
    () => buildMemoryTree(visibleMemories, reflections, entities, relations),
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
        title: memory.type,
        description: t("memory.memoryNodeDescription"),
        content: memory.content,
        source: memory.sourceContent,
      };
    }

    const reflection = reflections.find((item) => `reflection-${item.id}` === selectedNodeId);
    if (reflection) {
      return {
        title: reflection.title,
        description: t("memory.reflectionNodeDescription"),
        content: reflection.content,
      };
    }

    const entity = entities.find((item) => `entity-${item.id}` === selectedNodeId);
    if (entity) {
      const related = relations.filter(
        (relation) => relation.sourceEntityId === entity.id || relation.targetEntityId === entity.id,
      );
      return {
        title: entity.name,
        description: `${t("memory.entityNodeDescription")} · ${entity.type}`,
        content: related.length
          ? related.map((relation) => `${relation.type} (${relation.weight})`).join("\n")
          : t("memory.entityNodeEmpty"),
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
          />
        </View>

        <View className="gap-4 px-4 pt-4">
          <View className="gap-2">
            <Text className="text-xl font-semibold">{t("memory.graphTitle")}</Text>
            <Text className="text-sm text-muted-foreground">{t("memory.graphSubtitle")}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {filters.map((item) => (
                <FilterButton
                  key={item}
                  active={filter === item}
                  label={t(`memory.filter.${item}`)}
                  onPress={() => setFilter(item)}
                />
              ))}
            </View>
          </ScrollView>

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
              <MemoryEditor key={memory.id} memory={memory} onRefresh={refresh} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
