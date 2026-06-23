import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  dismissStoredMemory,
  listMemoryCandidates,
  listStoredMemories,
  updateCandidateStatus,
  type MemoryCandidate,
  type StoredMemory,
} from "@/lib/db";
import { t } from "@/lib/i18n";
import { getMemoryTypeLabel } from "@/lib/memoryLabels";

const isTaskMemory = (memory: StoredMemory) =>
  memory.candidateKind === "open_loop" || memory.type === "task" || memory.type === "goal";

const isTaskCandidate = (candidate: MemoryCandidate) =>
  candidate.kind === "open_loop" || candidate.type === "task" || candidate.type === "goal";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("tasks.actionFailed");
};

function SavedTaskCard({
  memory,
  onRefresh,
  onError,
}: {
  memory: StoredMemory;
  onRefresh: () => void;
  onError: (error: unknown) => void;
}) {
  const db = useSQLiteContext();
  const label = memory.candidateKind === "open_loop" ? t("tasks.openLoop") : getMemoryTypeLabel(memory.type);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        <CardDescription>
          {label} · {new Date(memory.createdAt).toLocaleDateString()}
        </CardDescription>
        <CardTitle className="text-sm leading-5">{memory.content}</CardTitle>
      </CardHeader>
      <CardContent className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() => router.push({ pathname: "/memory", params: { nodeId: `memory-${memory.id}` } } as Href)}
        >
          <Text>{t("tasks.openMemory")}</Text>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            void dismissStoredMemory(db, memory.id).then(onRefresh).catch(onError);
          }}
        >
          <Text>{t("tasks.complete")}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

function PendingTaskCard({
  candidate,
  onRefresh,
  onError,
}: {
  candidate: MemoryCandidate;
  onRefresh: () => void;
  onError: (error: unknown) => void;
}) {
  const db = useSQLiteContext();
  const label = candidate.kind === "open_loop" ? t("tasks.openLoop") : getMemoryTypeLabel(candidate.type);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        <CardDescription>
          {t("tasks.needsReview")} · {label} · {new Date(candidate.createdAt).toLocaleDateString()}
        </CardDescription>
        <CardTitle className="text-sm leading-5">{candidate.content}</CardTitle>
      </CardHeader>
      <CardContent className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() =>
            router.push({
              pathname: "/inbox",
              params: { tab: "pending", candidateId: candidate.id },
            } as Href)
          }
        >
          <Text>{t("tasks.review")}</Text>
        </Button>
        <Button
          size="sm"
          onPress={() => {
            void updateCandidateStatus(db, candidate.id, "accepted", candidate.content)
              .then(onRefresh)
              .catch(onError);
          }}
        >
          <Text>{t("tasks.saveTask")}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TasksScreen() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    Promise.all([listStoredMemories(db), listMemoryCandidates(db, "pending")])
      .then(([nextMemories, nextCandidates]) => {
        if (!active) return;
        setErrorMessage(null);
        setMemories(nextMemories.filter(isTaskMemory));
        setCandidates(nextCandidates.filter(isTaskCandidate));
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(getErrorMessage(error));
        setMemories([]);
        setCandidates([]);
      });

    return () => {
      active = false;
    };
  }, [db]);

  const handleError = useCallback((error: unknown) => {
    setErrorMessage(getErrorMessage(error));
  }, []);

  useFocusEffect(refresh);

  const overview = useMemo(
    () => ({
      active: memories.length,
      pending: candidates.length,
      openLoops: memories.filter((memory) => memory.candidateKind === "open_loop").length,
    }),
    [candidates.length, memories],
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen options={{ title: t("tasks.title") }} />

      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1 px-0.5">
          <Text className="text-xl font-semibold">{t("tasks.headerTitle")}</Text>
          <Text className="text-sm text-muted-foreground">{t("tasks.subtitle")}</Text>
        </View>

        <View className="flex-row gap-2">
          <Card className="flex-1 px-3 py-3">
            <CardDescription>{t("tasks.active")}</CardDescription>
            <Text className="text-2xl font-semibold">{overview.active}</Text>
          </Card>
          <Card className="flex-1 px-3 py-3">
            <CardDescription>{t("tasks.pending")}</CardDescription>
            <Text className="text-2xl font-semibold">{overview.pending}</Text>
          </Card>
          <Card className="flex-1 px-3 py-3">
            <CardDescription>{t("tasks.openLoops")}</CardDescription>
            <Text className="text-2xl font-semibold">{overview.openLoops}</Text>
          </Card>
        </View>

        {errorMessage ? (
          <Card className="gap-3 border-destructive/50 bg-destructive/5 p-4">
            <Text className="text-sm font-semibold text-destructive">{t("tasks.errorTitle")}</Text>
            <Text className="text-sm text-destructive">{errorMessage}</Text>
            <Button variant="outline" size="sm" className="self-start" onPress={refresh}>
              <Ionicons name="refresh-outline" size={14} color={iconColor} />
              <Text>{t("tasks.retry")}</Text>
            </Button>
          </Card>
        ) : null}

        <View className="gap-2">
          <Text className="px-0.5 text-lg font-semibold">{t("tasks.pendingTitle")}</Text>
          {candidates.length ? (
            candidates.map((candidate) => (
              <PendingTaskCard
                key={candidate.id}
                candidate={candidate}
                onRefresh={refresh}
                onError={handleError}
              />
            ))
          ) : (
            <Card className="min-h-24 items-center justify-center px-4">
              <Text variant="muted">{t("tasks.emptyPending")}</Text>
            </Card>
          )}
        </View>

        <View className="gap-2">
          <Text className="px-0.5 text-lg font-semibold">{t("tasks.activeTitle")}</Text>
          {memories.length ? (
            memories.map((memory) => (
              <SavedTaskCard key={memory.id} memory={memory} onRefresh={refresh} onError={handleError} />
            ))
          ) : (
            <Card className="min-h-24 items-center justify-center px-4">
              <Text variant="muted">{t("tasks.emptyActive")}</Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
