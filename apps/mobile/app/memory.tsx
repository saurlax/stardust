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
  listStoredMemories,
  type EntityRecord,
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
          <CardTitle className="text-sm leading-5">{memory.content}</CardTitle>
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
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(() => {
    let active = true;

    Promise.all([listStoredMemories(db), listReflections(db), listEntities(db)])
      .then(([nextMemories, nextReflections, nextEntities]) => {
        if (!active) return;
        setMemories(nextMemories);
        setReflections(nextReflections);
        setEntities(nextEntities);
      })
      .catch(() => {
        if (!active) return;
        setMemories([]);
        setReflections([]);
        setEntities([]);
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
    () => buildMemoryTree(visibleMemories, reflections, entities),
    [entities, reflections, visibleMemories],
  );

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
          <NebulaView style={{ flex: 1 }} tree={memoryTree} showLabels interactive />
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
