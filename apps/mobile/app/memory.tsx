import { useFocusEffect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
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
  listStoredMemories,
  type StoredMemory,
  updateStoredMemoryContent,
} from "@/lib/db";
import { t } from "@/lib/i18n";
import { THEME } from "@/lib/theme";

function MemoryManager({
  memories,
  onRefresh,
}: {
  memories: StoredMemory[];
  onRefresh: () => void;
}) {
  const db = useSQLiteContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <View className="gap-3 px-4 pb-6 pt-4">
      <View className="px-0.5">
        <Text className="text-lg font-semibold">{t("memory.manageTitle")}</Text>
      </View>

      {!memories.length ? (
        <Card className="min-h-24 items-center justify-center px-4">
          <Text variant="muted">{t("memory.empty")}</Text>
        </Card>
      ) : null}

      {memories.map((memory) => {
        const isEditing = editingId === memory.id;

        return (
          <Card key={memory.id} className="gap-3 py-4">
            <CardHeader className="gap-1">
              <CardDescription>{memory.type}</CardDescription>
              {isEditing ? (
                <Textarea
                  value={draft}
                  onChangeText={setDraft}
                  className="min-h-20 rounded-md bg-background"
                  numberOfLines={3}
                  placeholder={t("memory.editorPlaceholder")}
                />
              ) : (
                <CardTitle className="text-sm leading-5">{memory.content}</CardTitle>
              )}
            </CardHeader>
            <CardContent className="flex-row gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setEditingId(null);
                      setDraft("");
                    }}
                  >
                    <Text>{t("memory.cancel")}</Text>
                  </Button>
                  <Button
                    size="sm"
                    onPress={() => {
                      void updateStoredMemoryContent(db, memory.id, draft).then(() => {
                        setEditingId(null);
                        setDraft("");
                        onRefresh();
                      });
                    }}
                  >
                    <Text>{t("memory.save")}</Text>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setEditingId(memory.id);
                      setDraft(memory.content);
                    }}
                  >
                    <Text>{t("memory.edit")}</Text>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      void dismissStoredMemory(db, memory.id).then(() => {
                        if (editingId === memory.id) {
                          setEditingId(null);
                          setDraft("");
                        }
                        onRefresh();
                      });
                    }}
                  >
                    <Text>{t("memory.delete")}</Text>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </View>
  );
}

export default function MemoryScreen() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [memoryTree, setMemoryTree] = useState(buildMemoryTree([]));

  const refresh = useCallback(() => {
    let active = true;

    void listStoredMemories(db)
      .then((nextMemories) => {
        if (!active) return;
        setMemories(nextMemories);
        setMemoryTree(buildMemoryTree(nextMemories));
      })
      .catch(() => {
        if (!active) return;
        setMemories([]);
        setMemoryTree(buildMemoryTree([]));
      });

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

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

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ height: 360 }}>
          <NebulaView style={{ flex: 1 }} tree={memoryTree} showLabels interactive />
        </View>
        <MemoryManager memories={memories} onRefresh={refresh} />
      </ScrollView>
    </SafeAreaView>
  );
}
