import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveReflection,
  dismissStoredMemory,
  listDevices,
  listDeviceEvents,
  listMemoryCandidates,
  listReflections,
  listStoredMemories,
  promoteDeviceEventToCandidate,
  toToolCardsFromCandidates,
  updateCandidateStatus,
  updateReflectionContent,
  updateStoredMemoryContent,
  type DeviceRecord,
  type DeviceEventRecord,
  type MemoryCandidate,
  type ReflectionRecord,
  type StoredMemory,
} from "@/lib/db";
import { t } from "@/lib/i18n";

type Tab = "pending" | "saved" | "reflections" | "devices";

function TabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const color = active
    ? colorScheme === "dark"
      ? "#0A0A0A"
      : "#FAFAFA"
    : colorScheme === "dark"
      ? "#FAFAFA"
      : "#0A0A0A";

  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className="flex-1"
      onPress={onPress}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text>{label}</Text>
    </Button>
  );
}

function OpenEpisodeButton({ episodeId }: { episodeId?: string }) {
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
      <Text>{t("inbox.openTimeline")}</Text>
    </Button>
  );
}

function CandidateCard({
  candidate,
  onRefresh,
}: {
  candidate: MemoryCandidate;
  onRefresh: () => void;
}) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.content);
  const card = toToolCardsFromCandidates([candidate])[0];
  const relationSummary = card.payload.relationTarget
    ? `${card.payload.relationType ?? t("inbox.relatedTo")} · ${card.payload.relationTarget}`
    : undefined;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        <CardDescription>
          {candidate.kind} · {candidate.type}
        </CardDescription>
        <CardTitle className="text-base leading-5">{candidate.title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {editing ? (
          <Textarea
            value={draft}
            onChangeText={setDraft}
            className="min-h-24 rounded-md bg-background"
          />
        ) : (
          <Text className="text-sm leading-5">{candidate.content}</Text>
        )}

        {relationSummary ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.relation")}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">{relationSummary}</Text>
          </View>
        ) : null}

        {candidate.sourceContent ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.source")}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              {candidate.sourceTitle ? `${candidate.sourceTitle} · ` : ""}
              {candidate.sourceContent}
            </Text>
            <OpenEpisodeButton episodeId={candidate.episodeId} />
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  setEditing(false);
                  setDraft(candidate.content);
                }}
              >
                <Text>{t("inbox.cancel")}</Text>
              </Button>
              <Button
                size="sm"
                onPress={() => {
                  void updateCandidateStatus(db, candidate.id, "accepted", draft).then(onRefresh);
                }}
              >
                <Text>{t("inbox.accept")}</Text>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  void updateCandidateStatus(db, candidate.id, "dismissed").then(onRefresh);
                }}
              >
                <Text>{t("inbox.dismiss")}</Text>
              </Button>
              <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
                <Text>{t("inbox.edit")}</Text>
              </Button>
              <Button
                size="sm"
                onPress={() => {
                  void updateCandidateStatus(
                    db,
                    candidate.id,
                    "accepted",
                    card.payload.content,
                  ).then(onRefresh);
                }}
              >
                <Text>{t("inbox.accept")}</Text>
              </Button>
            </>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function MemoryCard({
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
    <Card className="gap-2 py-4">
      <CardContent className="gap-2">
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
          <Text className="text-sm leading-5">{memory.content}</Text>
        )}
        {memory.sourceContent ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.source")}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              {memory.sourceTitle ? `${memory.sourceTitle} · ` : ""}
              {memory.sourceContent}
            </Text>
            <OpenEpisodeButton episodeId={memory.episodeId} />
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
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
                <Text>{t("inbox.cancel")}</Text>
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
                <Text>{t("inbox.save")}</Text>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
                <Text>{t("inbox.edit")}</Text>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  void dismissStoredMemory(db, memory.id).then(onRefresh);
                }}
              >
                <Text>{t("inbox.archive")}</Text>
              </Button>
            </>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function ReflectionCard({
  reflection,
  onRefresh,
}: {
  reflection: ReflectionRecord;
  onRefresh: () => void;
}) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(reflection.title);
  const [draftContent, setDraftContent] = useState(reflection.content);

  return (
    <Card className="gap-2 py-4">
      <CardHeader className="gap-1">
        <CardDescription>{new Date(reflection.createdAt).toLocaleDateString()}</CardDescription>
        {editing ? (
          <Input value={draftTitle} onChangeText={setDraftTitle} />
        ) : (
          <CardTitle className="text-base">{reflection.title}</CardTitle>
        )}
      </CardHeader>
      <CardContent className="gap-3">
        {editing ? (
          <Textarea
            value={draftContent}
            onChangeText={setDraftContent}
            className="min-h-24 rounded-md bg-background"
          />
        ) : (
          <Text className="text-sm leading-5">{reflection.content}</Text>
        )}
        {reflection.sourceContent ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.source")}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              {reflection.sourceTitle ? `${reflection.sourceTitle} · ` : ""}
              {reflection.sourceContent}
            </Text>
            <OpenEpisodeButton episodeId={reflection.episodeId} />
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  setEditing(false);
                  setDraftTitle(reflection.title);
                  setDraftContent(reflection.content);
                }}
              >
                <Text>{t("inbox.cancel")}</Text>
              </Button>
              <Button
                size="sm"
                onPress={() => {
                  void updateReflectionContent(db, reflection.id, draftTitle, draftContent).then(() => {
                    setEditing(false);
                    onRefresh();
                  });
                }}
              >
                <Text>{t("inbox.save")}</Text>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
                <Text>{t("inbox.edit")}</Text>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  void archiveReflection(db, reflection.id).then(onRefresh);
                }}
              >
                <Text>{t("inbox.archive")}</Text>
              </Button>
            </>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function DeviceCard({ device }: { device: DeviceRecord }) {
  const detailLines = [
    `${t("inbox.lastSeen")}: ${
      device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : t("inbox.neverSeen")
    }`,
    device.batteryLevel === undefined ? undefined : `${t("inbox.battery")}: ${device.batteryLevel}%`,
    device.firmwareVersion ? `${t("inbox.firmware")}: ${device.firmwareVersion}` : undefined,
  ].filter(Boolean);

  return (
    <Card className="gap-2 py-4">
      <CardContent className="gap-2">
        <CardDescription>
          {device.kind} · {device.status}
        </CardDescription>
        <Text className="text-base font-semibold">{device.name}</Text>
        {detailLines.map((line) => (
          <Text key={line} className="text-sm text-muted-foreground">
            {line}
          </Text>
        ))}
      </CardContent>
    </Card>
  );
}

function DeviceEventCard({
  event,
  onPromoted,
}: {
  event: DeviceEventRecord;
  onPromoted: () => void;
}) {
  const db = useSQLiteContext();
  const metadataLines = Object.entries(event.metadata ?? {})
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

  return (
    <Card className="gap-2 py-4">
      <CardContent className="gap-3">
        <CardDescription>
          {event.eventType}
          {event.deviceName ? ` · ${event.deviceName}` : ""}
          {" · "}
          {new Date(event.createdAt).toLocaleString()}
        </CardDescription>
        <Text className="text-sm leading-5">{event.content}</Text>
        {metadataLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceMetadata")}
            </Text>
            {metadataLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {event.candidateStatus ? (
          <Text className="text-xs font-semibold text-muted-foreground">
            {t("inbox.deviceEventInReview")} · {event.candidateStatus}
          </Text>
        ) : !event.promotable ? (
          <Text className="text-xs font-semibold text-muted-foreground">
            {t("inbox.deviceEventOperational")}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              router.push({
                pathname: "/journal",
                params: { episodeId: `episode-${event.id}` },
              } as Href)
            }
          >
            <Ionicons name="open-outline" size={14} />
            <Text>{t("inbox.openTimeline")}</Text>
          </Button>
          {!event.candidateStatus && event.promotable ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                void promoteDeviceEventToCandidate(db, event).then(onPromoted);
              }}
            >
              <Ionicons name="sparkles-outline" size={14} />
              <Text>{t("inbox.promoteDeviceEvent")}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

export default function InboxScreen() {
  const db = useSQLiteContext();
  const [tab, setTab] = useState<Tab>("pending");
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [reflections, setReflections] = useState<ReflectionRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [deviceEvents, setDeviceEvents] = useState<DeviceEventRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("all");

  const loadInboxData = useCallback(
    () =>
      Promise.all([
        listMemoryCandidates(db, "pending"),
        listStoredMemories(db),
        listReflections(db),
        listDevices(db),
        listDeviceEvents(db),
      ]),
    [db],
  );

  const applyInboxData = useCallback(
    ([nextCandidates, nextMemories, nextReflections, nextDevices, nextDeviceEvents]: Awaited<
      ReturnType<typeof loadInboxData>
    >) => {
      setCandidates(nextCandidates);
      setMemories(nextMemories);
      setReflections(nextReflections);
      setDevices(nextDevices);
      setDeviceEvents(nextDeviceEvents);
    },
    [],
  );

  const clearInboxData = useCallback(() => {
    setCandidates([]);
    setMemories([]);
    setReflections([]);
    setDevices([]);
    setDeviceEvents([]);
  }, []);

  const refresh = useCallback(() => {
    void loadInboxData().then(applyInboxData).catch(clearInboxData);
  }, [applyInboxData, clearInboxData, loadInboxData]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadInboxData()
        .then((data) => {
          if (active) applyInboxData(data);
        })
        .catch(() => {
          if (active) clearInboxData();
        });

      return () => {
        active = false;
      };
    }, [applyInboxData, clearInboxData, loadInboxData]),
  );

  const emptyText = useMemo(() => {
    switch (tab) {
      case "saved":
        return t("inbox.emptySaved");
      case "reflections":
        return t("inbox.emptyReflections");
      case "devices":
        return t("inbox.emptyDevices");
      default:
        return t("inbox.emptyPending");
    }
  }, [tab]);
  const visibleDeviceEvents = useMemo(
    () =>
      selectedDeviceId === "all"
        ? deviceEvents
        : deviceEvents.filter((event) => event.deviceId === selectedDeviceId),
    [deviceEvents, selectedDeviceId],
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen options={{ title: t("inbox.title") }} />
      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1 px-0.5">
          <Text className="text-xl font-semibold">{t("inbox.headerTitle")}</Text>
          <Text className="text-sm text-muted-foreground">{t("inbox.subtitle")}</Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <TabButton
            active={tab === "pending"}
            label={t("inbox.pending")}
            icon="sparkles-outline"
            onPress={() => setTab("pending")}
          />
          <TabButton
            active={tab === "saved"}
            label={t("inbox.saved")}
            icon="archive-outline"
            onPress={() => setTab("saved")}
          />
        </View>
        <View className="flex-row flex-wrap gap-2">
          <TabButton
            active={tab === "reflections"}
            label={t("inbox.reflections")}
            icon="prism-outline"
            onPress={() => setTab("reflections")}
          />
          <TabButton
            active={tab === "devices"}
            label={t("inbox.devices")}
            icon="bluetooth-outline"
            onPress={() => setTab("devices")}
          />
        </View>

        {tab === "pending" && candidates.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} onRefresh={refresh} />
        ))}
        {tab === "saved" &&
          memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} onRefresh={refresh} />
          ))}
        {tab === "reflections" &&
          reflections.map((reflection) => (
            <ReflectionCard key={reflection.id} reflection={reflection} onRefresh={refresh} />
          ))}
        {tab === "devices" && devices.map((device) => <DeviceCard key={device.id} device={device} />)}
        {tab === "devices" && deviceEvents.length ? (
          <View className="gap-2">
            <Text className="px-0.5 text-lg font-semibold">{t("inbox.deviceEvents")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-4">
                <Button
                  variant={selectedDeviceId === "all" ? "default" : "outline"}
                  size="sm"
                  onPress={() => setSelectedDeviceId("all")}
                >
                  <Text>{t("inbox.allDevices")}</Text>
                </Button>
                {devices.map((device) => (
                  <Button
                    key={device.id}
                    variant={selectedDeviceId === device.id ? "default" : "outline"}
                    size="sm"
                    onPress={() => setSelectedDeviceId(device.id)}
                  >
                    <Text>{device.name}</Text>
                  </Button>
                ))}
              </View>
            </ScrollView>
            {visibleDeviceEvents.map((event) => (
              <DeviceEventCard
                key={event.id}
                event={event}
                onPromoted={() => {
                  refresh();
                  setTab("pending");
                }}
              />
            ))}
          </View>
        ) : null}

        {((tab === "pending" && !candidates.length) ||
          (tab === "saved" && !memories.length) ||
          (tab === "reflections" && !reflections.length) ||
          (tab === "devices" && !devices.length && !deviceEvents.length)) ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{emptyText}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
