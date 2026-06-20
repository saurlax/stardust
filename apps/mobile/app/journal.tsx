import { useFocusEffect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { formatMonthDay, formatTime, t } from "@/lib/i18n";
import {
  findRelevantKnowledge,
  listJournalDays,
  listJournalRecords,
  type JournalDay,
  type JournalRecord,
  updateJournalContent,
} from "@/lib/db";

function JournalManager({
  journals,
  onRefresh,
}: {
  journals: JournalRecord[];
  onRefresh: () => void;
}) {
  const db = useSQLiteContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <View className="gap-3">
      <View className="px-0.5">
        <Text className="text-lg font-semibold">{t("journal.capturesTitle")}</Text>
      </View>

      {journals.map((journal) => {
        const isEditing = editingId === journal.id;
        return (
          <Card key={journal.id} className="gap-3 py-4">
            <CardHeader className="gap-1">
              <CardDescription>
                {formatMonthDay(new Date(journal.createdAt))} · {formatTime(new Date(journal.createdAt))}
              </CardDescription>
              {isEditing ? (
                <Textarea
                  value={draft}
                  onChangeText={setDraft}
                  className="min-h-20 rounded-md bg-background"
                  numberOfLines={3}
                />
              ) : (
                <CardTitle className="text-sm leading-5">{journal.content}</CardTitle>
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
                    <Text>{t("journal.cancel")}</Text>
                  </Button>
                  <Button
                    size="sm"
                    onPress={() => {
                      void updateJournalContent(db, journal.id, draft).then(() => {
                        setEditingId(null);
                        setDraft("");
                        onRefresh();
                      });
                    }}
                  >
                    <Text>{t("journal.save")}</Text>
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setEditingId(journal.id);
                    setDraft(journal.content);
                  }}
                >
                  <Text>{t("journal.edit")}</Text>
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </View>
  );
}

export default function JournalScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<JournalDay[]>([]);
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    {
      id: string;
      source: "memory" | "episode" | "reflection";
      type?: string;
      content: string;
      createdAt: string;
      rank: number;
    }[]
  >([]);

  const refresh = useCallback(() => {
    let active = true;

    Promise.all([listJournalDays(db), listJournalRecords(db)])
      .then(([nextDays, nextJournals]) => {
        if (!active) return;
        setDays(nextDays);
        setJournals(nextJournals);
      })
      .catch(() => {
        if (!active) return;
        setDays([]);
        setJournals([]);
      });

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const runSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setQuery(value);

      if (!trimmed) {
        setResults([]);
        return;
      }

      void findRelevantKnowledge(db, trimmed).then(setResults).catch(() => setResults([]));
    },
    [db],
  );

  const hasSearch = query.trim().length > 0;
  const visibleResults = useMemo(() => results.slice(0, 8), [results]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen
        options={{
          title: t("journal.title"),
        }}
      />

      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-2 px-0.5">
          <Text className="text-xl font-semibold">{t("journal.headerTitle")}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">{t("journal.subtitle")}</Text>
        </View>

        <Card className="gap-3 py-4">
          <CardHeader className="gap-1">
            <CardTitle>{t("journal.searchTitle")}</CardTitle>
            <CardDescription>{t("journal.searchPlaceholder")}</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <Input
              value={query}
              onChangeText={runSearch}
              placeholder={t("journal.searchPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {hasSearch && !visibleResults.length ? (
              <Text variant="muted">{t("journal.searchEmpty")}</Text>
            ) : null}

            {visibleResults.map((result) => (
              <Card key={result.id} className="gap-2 py-4">
                <CardContent className="gap-1">
                  <CardDescription>
                    {result.source === "memory"
                      ? t("journal.memoryEntryPrefix")
                      : result.source === "reflection"
                        ? t("journal.reflectionEntryPrefix")
                        : t("journal.episodeEntryPrefix")}
                    {result.type ? ` · ${result.type}` : ""}
                  </CardDescription>
                  <Text className="text-sm leading-5">{result.content}</Text>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        <JournalManager journals={journals} onRefresh={refresh} />

        {!days.length ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{t("journal.empty")}</Text>
          </Card>
        ) : null}

        {days.map((day, index, allDays) => {
          const isLastDay = index === allDays.length - 1;

          return (
            <View key={day.date.toISOString()} className="relative">
              <Text className="mb-2 ml-0.5 text-xs font-semibold">{formatMonthDay(day.date)}</Text>

              <View
                className="absolute left-1.5 top-6 border-l border-dashed border-border"
                style={{ bottom: isLastDay ? 8 : -6 }}
              />

              <View className="gap-2.5 pb-3.5 pl-4">
                {day.entries.map((entry) => (
                  <Card key={entry.id} className="min-h-[72px] justify-center gap-1 py-4">
                    <CardContent className="gap-1">
                      <CardDescription>
                        {formatTime(new Date(entry.timestamp))}
                        {entry.source === "memory" ? ` · ${t("journal.memoryEntryPrefix")}` : ""}
                      </CardDescription>
                      <Text className="text-sm leading-5">{entry.note}</Text>
                    </CardContent>
                  </Card>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
