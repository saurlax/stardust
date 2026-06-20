import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { formatMonthDay, formatTime, t } from "@/lib/i18n";
import {
  getDeviceEventTypeLabel,
  getEpisodeTitleLabel,
  getKnowledgeTypeLabel,
  getMemoryTypeLabel,
} from "@/lib/memoryLabels";
import {
  findRelevantKnowledge,
  listJournalDays,
  listJournalRecords,
  type JournalDay,
  type JournalRecord,
  updateJournalContent,
} from "@/lib/db";

const sourceFilters = ["all", "chat", "share", "image", "calendar", "iot", "journal", "memory"] as const;
type SourceFilter = (typeof sourceFilters)[number];

const sourceIcons: Record<Exclude<SourceFilter, "all">, keyof typeof Ionicons.glyphMap> = {
  chat: "chatbubble-ellipses-outline",
  share: "share-social-outline",
  image: "image-outline",
  calendar: "calendar-outline",
  iot: "hardware-chip-outline",
  journal: "create-outline",
  memory: "sparkles-outline",
};

function sourceLabel(source: SourceFilter) {
  return t(`journal.source.${source}`);
}

function entryTitle(entry: JournalDay["entries"][number]) {
  if (!entry.title) return undefined;
  if (entry.source === "memory") return getMemoryTypeLabel(entry.title);
  return getEpisodeTitleLabel(entry.source, entry.title);
}

function EpisodeMediaPreview({ entry }: { entry: JournalDay["entries"][number] }) {
  if (!entry.mediaUri) return null;

  return (
    <Image
      source={{ uri: entry.mediaUri }}
      resizeMode="cover"
      accessibilityLabel={entryTitle(entry) ?? t("journal.mediaPreview")}
      className="mt-1 h-36 w-full rounded-md bg-muted"
    />
  );
}

const getStringMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

function getEntrySourceDetailLines(entry: JournalDay["entries"][number]) {
  const metadata = entry.metadata;
  if (entry.source === "calendar") {
    const startDate = getStringMetadata(metadata, "startDate");
    const endDate = getStringMetadata(metadata, "endDate");
    const location = getStringMetadata(metadata, "location");

    return [
      startDate && endDate
        ? `${t("journal.calendarTime")}: ${formatMonthDay(new Date(startDate))} ${formatTime(new Date(startDate))} - ${formatTime(
            new Date(endDate),
          )}`
        : undefined,
      location ? `${t("journal.calendarLocation")}: ${location}` : undefined,
    ].filter((line): line is string => !!line);
  }

  if (entry.source === "iot") {
    const deviceTimestamp = getStringMetadata(metadata, "deviceTimestamp");
    const captureSource = getStringMetadata(metadata, "source");
    const deviceId = getStringMetadata(metadata, "deviceId");

    return [
      deviceTimestamp ? `${t("journal.deviceTime")}: ${deviceTimestamp}` : undefined,
      captureSource ? `${t("journal.captureSource")}: ${getDeviceEventTypeLabel(captureSource)}` : undefined,
      deviceId ? `${t("journal.deviceId")}: ${deviceId}` : undefined,
    ].filter((line): line is string => !!line);
  }

  return [];
}

function EntrySourceDetails({ entry }: { entry: JournalDay["entries"][number] }) {
  const visibleLines = getEntrySourceDetailLines(entry);
  if (!visibleLines.length) return null;

  return (
    <View className="gap-0.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2">
      {visibleLines.map((line) => (
        <Text key={line} className="text-xs leading-4 text-muted-foreground">
          {line}
        </Text>
      ))}
    </View>
  );
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("journal.actionFailed");
};

function SourceFilterButton({
  active,
  source,
  count,
  onPress,
}: {
  active: boolean;
  source: SourceFilter;
  count: number;
  onPress: () => void;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onPress={onPress}>
      <Text>{`${sourceLabel(source)} ${count}`}</Text>
    </Button>
  );
}

function JournalManager({
  journals,
  onRefresh,
  onError,
}: {
  journals: JournalRecord[];
  onRefresh: () => void;
  onError: (error: unknown) => void;
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
                      void updateJournalContent(db, journal.id, draft)
                        .then(() => {
                          setEditingId(null);
                          setDraft("");
                          onRefresh();
                        })
                        .catch(onError);
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
  const params = useLocalSearchParams<{ episodeId?: string }>();
  const selectedEpisodeId = typeof params.episodeId === "string" ? params.episodeId : undefined;
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const scrollRef = useRef<ScrollView>(null);
  const entryOffsetsRef = useRef(new Map<string, number>());
  const [days, setDays] = useState<JournalDay[]>([]);
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<
    {
      id: string;
      source: "memory" | "episode" | "reflection" | "entity" | "relation";
      type?: string;
      title?: string;
      content: string;
      createdAt: string;
      nodeId?: string;
      rank: number;
    }[]
  >([]);

  const refresh = useCallback(() => {
    let active = true;

    Promise.all([listJournalDays(db), listJournalRecords(db)])
      .then(([nextDays, nextJournals]) => {
        if (!active) return;
        setErrorMessage(null);
        setDays(nextDays);
        setJournals(nextJournals);
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage(t("journal.loadFailed"));
        setDays([]);
        setJournals([]);
      });

    return () => {
      active = false;
    };
  }, [db]);

  const handleJournalError = useCallback((error: unknown) => {
    setErrorMessage(getErrorMessage(error));
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    if (selectedEpisodeId) {
      setSourceFilter("all");
    }
  }, [selectedEpisodeId]);

  const runSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setQuery(value);

      if (!trimmed) {
        setResults([]);
        return;
      }

      void findRelevantKnowledge(db, trimmed)
        .then((nextResults) => {
          setErrorMessage(null);
          setResults(nextResults);
        })
        .catch((error) => {
          setResults([]);
          setErrorMessage(getErrorMessage(error));
        });
    },
    [db],
  );

  const hasSearch = query.trim().length > 0;
  const visibleResults = useMemo(() => results.slice(0, 8), [results]);
  const visibleDays = useMemo(
    () =>
      sourceFilter === "all"
        ? days
        : days
            .map((day) => ({
              ...day,
              entries: day.entries.filter((entry) => entry.source === sourceFilter),
            }))
            .filter((day) => day.entries.length),
    [days, sourceFilter],
  );
  const sourceCounts = useMemo(
    () => {
      const entries = days.flatMap((day) => day.entries);
      return sourceFilters.reduce<Record<SourceFilter, number>>(
        (counts, source) => {
          counts[source] =
            source === "all"
              ? entries.length
              : entries.filter((entry) => entry.source === source).length;
          return counts;
        },
        {
          all: 0,
          chat: 0,
          share: 0,
          image: 0,
          calendar: 0,
          iot: 0,
          journal: 0,
          memory: 0,
        },
      );
    },
    [days],
  );
  const selectedEntry = useMemo(
    () =>
      selectedEpisodeId
        ? days.flatMap((day) => day.entries).find((entry) => entry.id === selectedEpisodeId)
        : undefined,
    [days, selectedEpisodeId],
  );

  useEffect(() => {
    if (!selectedEpisodeId) return;

    const timeout = setTimeout(() => {
      const offset = entryOffsetsRef.current.get(selectedEpisodeId);
      if (offset === undefined) return;
      scrollRef.current?.scrollTo({ y: Math.max(offset - 120, 0), animated: true });
    }, 80);

    return () => clearTimeout(timeout);
  }, [selectedEpisodeId, visibleDays]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen
        options={{
          title: t("journal.title"),
        }}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ gap: 12, padding: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-2 px-0.5">
          <Text className="text-xl font-semibold">{t("journal.headerTitle")}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">{t("journal.subtitle")}</Text>
        </View>

        {errorMessage ? (
          <Card className="gap-3 border-destructive/50 bg-destructive/5 p-4">
            <Text className="text-sm font-semibold text-destructive">
              {t("journal.errorTitle")}
            </Text>
            <Text className="text-sm text-destructive">{errorMessage}</Text>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onPress={() => {
                refresh();
              }}
            >
              <Ionicons name="refresh-outline" size={14} color={iconColor} />
              <Text>{t("journal.retry")}</Text>
            </Button>
          </Card>
        ) : null}

        {selectedEntry ? (
          <Card className="gap-2 py-4">
            <CardContent className="gap-2">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name={sourceIcons[selectedEntry.source]} size={14} color={iconColor} />
                <CardDescription>
                  {t("journal.selectedSource")} · {sourceLabel(selectedEntry.source)} ·{" "}
                  {formatMonthDay(new Date(selectedEntry.timestamp))}
                </CardDescription>
              </View>
              {entryTitle(selectedEntry) ? (
                <Text className="text-sm font-semibold">{entryTitle(selectedEntry)}</Text>
              ) : null}
              <EpisodeMediaPreview entry={selectedEntry} />
              <EntrySourceDetails entry={selectedEntry} />
              <Text className="text-sm leading-5">{selectedEntry.note}</Text>
            </CardContent>
          </Card>
        ) : null}

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
                        : result.source === "entity"
                          ? t("journal.entityEntryPrefix")
                          : result.source === "relation"
                            ? t("journal.relationEntryPrefix")
                          : t("journal.episodeEntryPrefix")}
                    {result.type ? ` · ${getKnowledgeTypeLabel(result.source, result.type)}` : ""}
                  </CardDescription>
                  {result.title ? (
                    <Text className="text-sm font-semibold leading-5">{result.title}</Text>
                  ) : null}
                  <Text className="text-sm leading-5">{result.content}</Text>
                  {result.source === "episode" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 self-start"
                      onPress={() =>
                        router.push({
                          pathname: "/journal",
                          params: { episodeId: result.id },
                        } as Href)
                      }
                    >
                      <Text>{t("journal.openTimeline")}</Text>
                    </Button>
                  ) : result.source === "memory" ||
                    result.source === "reflection" ||
                    result.source === "entity" ||
                    result.source === "relation" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 self-start"
                      onPress={() =>
                        router.push({
                          pathname: "/memory",
                          params: {
                            nodeId:
                              result.nodeId ??
                              (result.source === "memory"
                                ? `memory-${result.id}`
                                : result.source === "entity"
                                  ? `entity-${result.id}`
                                  : result.source === "relation"
                                    ? "root"
                                    : `reflection-${result.id}`),
                          },
                        } as Href)
                      }
                    >
                      <Text>{t("journal.openMemoryGraph")}</Text>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        <JournalManager
          journals={journals}
          onRefresh={refresh}
          onError={handleJournalError}
        />

        <View className="gap-2">
          <View className="px-0.5">
            <Text className="text-lg font-semibold">{t("journal.timelineTitle")}</Text>
            <Text className="text-sm text-muted-foreground">{t("journal.timelineSubtitle")}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {sourceFilters.map((source) => (
                <SourceFilterButton
                  key={source}
                  active={sourceFilter === source}
                  source={source}
                  count={sourceCounts[source]}
                  onPress={() => setSourceFilter(source)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {!visibleDays.length ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{t("journal.empty")}</Text>
          </Card>
        ) : null}

        {visibleDays.map((day, index, allDays) => {
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
                  <Card
                    key={entry.id}
                    onLayout={(event) => {
                      entryOffsetsRef.current.set(entry.id, event.nativeEvent.layout.y);
                    }}
                    className={`min-h-[72px] justify-center gap-1 py-4 ${
                      entry.id === selectedEpisodeId ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <CardContent className="gap-1">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name={sourceIcons[entry.source]} size={13} color={iconColor} />
                        <CardDescription>
                          {formatTime(new Date(entry.timestamp))} · {sourceLabel(entry.source)}
                          {entry.id === selectedEpisodeId ? ` · ${t("journal.selectedSource")}` : ""}
                        </CardDescription>
                      </View>
                      {entryTitle(entry) ? (
                        <Text className="text-sm font-semibold">{entryTitle(entry)}</Text>
                      ) : null}
                      <EpisodeMediaPreview entry={entry} />
                      <EntrySourceDetails entry={entry} />
                      <Text className="text-sm leading-5">{entry.note}</Text>
                      {entry.source === "memory" && entry.nodeId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 self-start"
                          onPress={() =>
                            router.push({
                              pathname: "/memory",
                              params: { nodeId: entry.nodeId },
                            } as Href)
                          }
                        >
                          <Text>{t("journal.openMemoryGraph")}</Text>
                        </Button>
                      ) : null}
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
