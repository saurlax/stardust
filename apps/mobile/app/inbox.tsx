import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getDeviceCapabilityLabel, getDeviceCapabilitySummary } from "@/lib/devices/capabilities";
import { t } from "@/lib/i18n";
import {
  getCandidateKindLabel,
  getDeviceEventTypeLabel,
  getDeviceKindLabel,
  getEpisodeTitleLabel,
  getMemoryTypeLabel,
} from "@/lib/memoryLabels";

type Tab = "pending" | "saved" | "reflections" | "devices";
const pendingKindFilters = ["all", "memory", "journal", "reflection", "entity", "open_loop"] as const;
type PendingKindFilter = (typeof pendingKindFilters)[number];
const deviceEventFilters = ["all", "promotable", "in_review", "operational"] as const;
type DeviceEventFilter = (typeof deviceEventFilters)[number];

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("inbox.actionFailed");
};

const getCandidateStatusLabel = (status?: DeviceEventRecord["candidateStatus"]) => {
  switch (status) {
    case "accepted":
      return t("inbox.candidateStatus.accepted");
    case "dismissed":
      return t("inbox.candidateStatus.dismissed");
    case "pending":
      return t("inbox.candidateStatus.pending");
    default:
      return undefined;
  }
};

const getDeviceStatusLabel = (status: DeviceRecord["status"]) => {
  switch (status) {
    case "connected":
      return t("inbox.deviceStatus.connected");
    case "disconnected":
      return t("inbox.deviceStatus.disconnected");
    default:
      return t("inbox.deviceStatus.known");
  }
};

const getCandidateTitle = (candidate: MemoryCandidate) => {
  if (candidate.metadata?.source === "device_event") {
    const eventType =
      typeof candidate.metadata.eventType === "string" ? candidate.metadata.eventType : undefined;
    const deviceName =
      typeof candidate.metadata.deviceName === "string" ? candidate.metadata.deviceName : undefined;
    if (eventType && deviceName) return `${getDeviceEventTypeLabel(eventType)} · ${deviceName}`;
    if (eventType) return getDeviceEventTypeLabel(eventType);
  }

  return candidate.title;
};

const getSourcePrefix = (sourceKind?: StoredMemory["sourceKind"], sourceTitle?: string) => {
  const label = getEpisodeTitleLabel(sourceKind, sourceTitle);
  return label ? `${label} · ` : "";
};

const getDeviceCandidateContextLines = (candidate: MemoryCandidate) => {
  if (candidate.metadata?.source !== "device_event") return [];
  const eventType =
    typeof candidate.metadata.eventType === "string" ? candidate.metadata.eventType : undefined;
  const deviceName =
    typeof candidate.metadata.deviceName === "string" ? candidate.metadata.deviceName : undefined;
  const eventCreatedAt =
    typeof candidate.metadata.eventCreatedAt === "string" ? candidate.metadata.eventCreatedAt : undefined;
  const eventMetadata =
    candidate.metadata.eventMetadata &&
    typeof candidate.metadata.eventMetadata === "object" &&
    !Array.isArray(candidate.metadata.eventMetadata)
      ? (candidate.metadata.eventMetadata as Record<string, unknown>)
      : undefined;
  const captureSource =
    typeof eventMetadata?.source === "string" ? eventMetadata.source : undefined;
  const deviceTimestamp =
    typeof eventMetadata?.deviceTimestamp === "string" ? eventMetadata.deviceTimestamp : undefined;
  return [
    deviceName ? `${t("inbox.deviceContextDevice")}: ${deviceName}` : undefined,
    eventType ? `${t("inbox.deviceContextEvent")}: ${getDeviceEventTypeLabel(eventType)}` : undefined,
    captureSource
      ? `${t("inbox.deviceContextCaptureSource")}: ${getDeviceEventTypeLabel(captureSource)}`
      : undefined,
    deviceTimestamp ? `${t("inbox.deviceContextDeviceTime")}: ${deviceTimestamp}` : undefined,
    eventCreatedAt
      ? `${t("inbox.deviceContextReceived")}: ${new Date(eventCreatedAt).toLocaleString()}`
      : undefined,
  ].filter((line): line is string => !!line);
};

const getManifestMediaLines = (metadata?: Record<string, unknown>) => {
  const media = metadata?.media;
  if (!media || typeof media !== "object" || Array.isArray(media)) return [];
  return Object.entries(media as Record<string, unknown>).map(([key, value]) => {
    const label = key === "microSD" ? "microSD" : key;
    return `${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
  });
};

const getManifestCaptureSourceLines = (metadata?: Record<string, unknown>) => {
  const captureSources = metadata?.captureSources;
  if (!Array.isArray(captureSources)) return [];
  return captureSources
    .filter((source): source is string => typeof source === "string")
    .map((source) => getDeviceEventTypeLabel(source));
};

const getManifestCapabilityLines = (metadata?: Record<string, unknown>) => {
  const capabilities = metadata?.capabilities;
  if (!Array.isArray(capabilities)) return [];
  return capabilities
    .filter((capability): capability is string => typeof capability === "string")
    .map((capability) => getDeviceCapabilityLabel(capability));
};

const getManifestTransferPlanLines = (metadata?: Record<string, unknown>) => {
  const transferPlan = metadata?.transferPlan;
  if (!transferPlan || typeof transferPlan !== "object" || Array.isArray(transferPlan)) return [];
  return Object.entries(transferPlan as Record<string, unknown>).map(
    ([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
};

const getDeviceEventContextLines = (event: DeviceEventRecord) => {
  const captureSource =
    typeof event.metadata?.source === "string" ? event.metadata.source : undefined;
  const deviceTimestamp =
    typeof event.metadata?.deviceTimestamp === "string" ? event.metadata.deviceTimestamp : undefined;
  return [
    captureSource
      ? `${t("inbox.deviceContextCaptureSource")}: ${getDeviceEventTypeLabel(captureSource)}`
      : undefined,
    deviceTimestamp ? `${t("inbox.deviceContextDeviceTime")}: ${deviceTimestamp}` : undefined,
  ].filter((line): line is string => !!line);
};

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

function SummaryTile({
  label,
  value,
  icon,
  active,
  onPress,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = active
    ? colorScheme === "dark"
      ? "#0A0A0A"
      : "#FAFAFA"
    : colorScheme === "dark"
      ? "#FAFAFA"
      : "#0A0A0A";

  return (
    <Button
      variant={active ? "default" : "outline"}
      className="min-h-[74px] flex-1 items-start justify-between rounded-md px-3 py-2"
      onPress={onPress}
    >
      <View className="w-full flex-row items-center justify-between gap-2">
        <Text className="text-xs">{label}</Text>
        <Ionicons name={icon} size={15} color={iconColor} />
      </View>
      <Text className="text-2xl font-semibold leading-7">{value}</Text>
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

function OpenDeviceSettingsButton() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";

  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-2 self-center"
      onPress={() => router.push("/settings")}
    >
      <Ionicons name="settings-outline" size={14} color={iconColor} />
      <Text>{t("inbox.openDeviceSettings")}</Text>
    </Button>
  );
}

function CandidateCard({
  candidate,
  highlighted,
  onRefresh,
  onError,
}: {
  candidate: MemoryCandidate;
  highlighted?: boolean;
  onRefresh: () => void;
  onError: (error: unknown) => void;
}) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.content);
  const card = toToolCardsFromCandidates([candidate])[0];
  const relationSummary = card.payload.relationTarget
    ? `${card.payload.relationType ?? t("inbox.relatedTo")} · ${card.payload.relationTarget}`
    : undefined;
  const rationale =
    typeof candidate.metadata?.rationale === "string" ? candidate.metadata.rationale : undefined;
  const deviceContextLines = getDeviceCandidateContextLines(candidate);

  return (
    <Card className={`gap-3 py-4 ${highlighted ? "border-primary bg-primary/5" : ""}`}>
      <CardHeader className="gap-1">
        <CardDescription>
          {getCandidateKindLabel(candidate.kind)} · {getMemoryTypeLabel(candidate.type)}
        </CardDescription>
        <Text className="text-xs leading-4 text-muted-foreground">
          {t("inbox.suggestedAt")} · {new Date(candidate.createdAt).toLocaleString()}
        </Text>
        <CardTitle className="text-base leading-5">{getCandidateTitle(candidate)}</CardTitle>
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

        {rationale ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.rationale")}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">{rationale}</Text>
          </View>
        ) : null}

        {deviceContextLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceContext")}
            </Text>
            {deviceContextLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
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
            {candidate.sourceCreatedAt ? (
              <Text className="text-xs leading-4 text-muted-foreground">
                {new Date(candidate.sourceCreatedAt).toLocaleString()}
              </Text>
            ) : null}
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
                  void updateCandidateStatus(db, candidate.id, "accepted", draft)
                    .then(onRefresh)
                    .catch(onError);
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
                  void updateCandidateStatus(db, candidate.id, "dismissed")
                    .then(onRefresh)
                    .catch(onError);
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
                  )
                    .then(onRefresh)
                    .catch(onError);
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
    <Card className="gap-2 py-4">
      <CardContent className="gap-2">
        <CardDescription>
          {memory.candidateKind === "open_loop" ? `${t("inbox.openLoopBadge")} · ` : ""}
          {getMemoryTypeLabel(memory.type)} · {t("inbox.importance")} {memory.importance} ·{" "}
          {new Date(memory.createdAt).toLocaleDateString()}
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
              {getSourcePrefix(memory.sourceKind, memory.sourceTitle)}
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
                  void updateStoredMemoryContent(db, memory.id, draft)
                    .then(() => {
                      setEditing(false);
                      onRefresh();
                    })
                    .catch(onError);
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
                  void dismissStoredMemory(db, memory.id).then(onRefresh).catch(onError);
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
  onError,
}: {
  reflection: ReflectionRecord;
  onRefresh: () => void;
  onError: (error: unknown) => void;
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
              {getSourcePrefix(reflection.sourceKind, reflection.sourceTitle)}
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
                  void updateReflectionContent(db, reflection.id, draftTitle, draftContent)
                    .then(() => {
                      setEditing(false);
                      onRefresh();
                    })
                    .catch(onError);
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
                  void archiveReflection(db, reflection.id).then(onRefresh).catch(onError);
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
    device.protocolVersion ? `${t("inbox.protocol")}: ${device.protocolVersion}` : undefined,
    device.capabilities?.length
      ? `${t("inbox.capabilities")}: ${getDeviceCapabilitySummary(device.capabilities)}`
      : undefined,
    `${t("inbox.deviceEventCount")}: ${device.eventCount}`,
    device.pendingReviewCount ? `${t("inbox.pendingReviews")}: ${device.pendingReviewCount}` : undefined,
    device.reviewedEventCount ? `${t("inbox.reviewedEvents")}: ${device.reviewedEventCount}` : undefined,
    device.lastEventAt
      ? `${t("inbox.lastEvent")}: ${new Date(device.lastEventAt).toLocaleString()}`
      : undefined,
  ].filter(Boolean);

  return (
    <Card className="gap-2 py-4">
      <CardContent className="gap-2">
        <CardDescription>
          {getDeviceKindLabel(device.kind)} · {getDeviceStatusLabel(device.status)}
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

function DeviceSelectionSummary({
  selectedDevice,
  deviceCount,
  eventCount,
  pendingReviewCount,
}: {
  selectedDevice?: DeviceRecord;
  deviceCount: number;
  eventCount: number;
  pendingReviewCount: number;
}) {
  const detailLines = selectedDevice
    ? [
        `${t("inbox.deviceStatusLabel")}: ${getDeviceStatusLabel(selectedDevice.status)}`,
        `${t("inbox.deviceEventCount")}: ${selectedDevice.eventCount}`,
        `${t("inbox.pendingReviews")}: ${selectedDevice.pendingReviewCount}`,
        selectedDevice.reviewedEventCount
          ? `${t("inbox.reviewedEvents")}: ${selectedDevice.reviewedEventCount}`
          : undefined,
        selectedDevice.lastEventAt
          ? `${t("inbox.lastEvent")}: ${new Date(selectedDevice.lastEventAt).toLocaleString()}`
          : undefined,
      ]
    : [
        `${t("inbox.deviceCount")}: ${deviceCount}`,
        `${t("inbox.deviceEventCount")}: ${eventCount}`,
        `${t("inbox.pendingReviews")}: ${pendingReviewCount}`,
      ];

  return (
    <Card className="gap-2 border-primary/30 bg-primary/5 py-4">
      <CardContent className="gap-2">
        <CardDescription>{t("inbox.deviceReviewScope")}</CardDescription>
        <Text className="text-base font-semibold">
          {selectedDevice ? selectedDevice.name : t("inbox.allDevices")}
        </Text>
        {detailLines.filter(Boolean).map((line) => (
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
  onOpenReview,
  onError,
}: {
  event: DeviceEventRecord;
  onPromoted: () => void;
  onOpenReview: () => void;
  onError: (error: unknown) => void;
}) {
  const db = useSQLiteContext();
  const candidateStatusLabel = getCandidateStatusLabel(event.candidateStatus);
  const manifestMediaLines =
    event.eventType === "manifest" ? getManifestMediaLines(event.metadata) : [];
  const manifestCaptureSourceLines =
    event.eventType === "manifest" ? getManifestCaptureSourceLines(event.metadata) : [];
  const manifestCapabilityLines =
    event.eventType === "manifest" ? getManifestCapabilityLines(event.metadata) : [];
  const manifestTransferPlanLines =
    event.eventType === "manifest" ? getManifestTransferPlanLines(event.metadata) : [];
  const deviceEventContextLines = getDeviceEventContextLines(event);
  const metadataLines = Object.entries(event.metadata ?? {})
    .filter(
      ([key]) =>
        key !== "media" &&
        key !== "transferPlan" &&
        key !== "captureSources" &&
        key !== "capabilities" &&
        key !== "source" &&
        key !== "deviceTimestamp",
    )
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

  return (
    <Card className="gap-2 py-4">
      <CardContent className="gap-3">
        <CardDescription>
          {getDeviceEventTypeLabel(event.eventType)}
          {event.deviceName ? ` · ${event.deviceName}` : ""}
          {" · "}
          {new Date(event.createdAt).toLocaleString()}
        </CardDescription>
        <Text className="text-sm leading-5">{event.content}</Text>
        {manifestMediaLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceManifestMedia")}
            </Text>
            {manifestMediaLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {manifestCaptureSourceLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceManifestCaptureSources")}
            </Text>
            {manifestCaptureSourceLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {manifestCapabilityLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceManifestCapabilities")}
            </Text>
            {manifestCapabilityLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {manifestTransferPlanLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceManifestTransferPlan")}
            </Text>
            {manifestTransferPlanLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {deviceEventContextLines.length ? (
          <View className="gap-1 rounded-md bg-muted/60 px-3 py-2">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("inbox.deviceContext")}
            </Text>
            {deviceEventContextLines.map((line) => (
              <Text key={line} className="text-xs leading-4 text-muted-foreground">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
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
            {t("inbox.deviceEventInReview")} · {candidateStatusLabel}
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
                void promoteDeviceEventToCandidate(db, event).then(onPromoted).catch(onError);
              }}
            >
              <Ionicons name="sparkles-outline" size={14} />
              <Text>{t("inbox.promoteDeviceEvent")}</Text>
            </Button>
          ) : event.candidateStatus === "pending" ? (
            <Button variant="outline" size="sm" onPress={onOpenReview}>
              <Ionicons name="sparkles-outline" size={14} />
              <Text>{t("inbox.openReview")}</Text>
            </Button>
          ) : event.candidateStatus === "accepted" && event.candidateId ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                router.push({
                  pathname: "/memory",
                  params: { nodeId: `memory-memory-${event.candidateId}` },
                } as Href)
              }
            >
              <Ionicons name="git-network-outline" size={14} />
              <Text>{t("inbox.openMemoryGraph")}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

export default function InboxScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ tab?: string; candidateId?: string; deviceId?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const candidateOffsetsRef = useRef(new Map<string, number>());
  const [tab, setTab] = useState<Tab>("pending");
  const [targetCandidateId, setTargetCandidateId] = useState<string | undefined>(
    typeof params.candidateId === "string" ? params.candidateId : undefined,
  );
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [pendingKindFilter, setPendingKindFilter] = useState<PendingKindFilter>("all");
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [reflections, setReflections] = useState<ReflectionRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [deviceEvents, setDeviceEvents] = useState<DeviceEventRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("all");
  const [deviceEventFilter, setDeviceEventFilter] = useState<DeviceEventFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(null);
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

  const handleInboxError = useCallback((error: unknown) => {
    setErrorMessage(getErrorMessage(error));
  }, []);

  const refresh = useCallback(() => {
    void loadInboxData().then(applyInboxData).catch((error) => {
      clearInboxData();
      handleInboxError(error);
    });
  }, [applyInboxData, clearInboxData, handleInboxError, loadInboxData]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadInboxData()
        .then((data) => {
          if (active) applyInboxData(data);
        })
        .catch(() => {
          if (!active) return;
          clearInboxData();
          setErrorMessage(t("inbox.loadFailed"));
        });

      return () => {
        active = false;
      };
    }, [applyInboxData, clearInboxData, loadInboxData]),
  );

  useEffect(() => {
    if (params.tab === "pending" || params.tab === "saved" || params.tab === "reflections" || params.tab === "devices") {
      setTab(params.tab);
    }
    if (typeof params.candidateId === "string") {
      setTargetCandidateId(params.candidateId);
      setPendingKindFilter("all");
    }
    if (typeof params.deviceId === "string") {
      setSelectedDeviceId(params.deviceId);
      setDeviceEventFilter("all");
    }
  }, [params.candidateId, params.deviceId, params.tab]);

  useEffect(() => {
    if (tab !== "pending" || !targetCandidateId || !candidates.length) return;
    const timeout = setTimeout(() => {
      const offset = candidateOffsetsRef.current.get(targetCandidateId);
      if (offset === undefined) return;
      scrollRef.current?.scrollTo({ y: Math.max(offset - 96, 0), animated: true });
    }, 80);
    return () => clearTimeout(timeout);
  }, [candidates.length, tab, targetCandidateId]);

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
    () => {
      const byDevice =
        selectedDeviceId === "all"
          ? deviceEvents
          : deviceEvents.filter((event) => event.deviceId === selectedDeviceId);

      switch (deviceEventFilter) {
        case "promotable":
          return byDevice.filter((event) => event.promotable && !event.candidateStatus);
        case "in_review":
          return byDevice.filter((event) => !!event.candidateStatus);
        case "operational":
          return byDevice.filter((event) => !event.promotable);
        default:
          return byDevice;
      }
    },
    [deviceEventFilter, deviceEvents, selectedDeviceId],
  );
  const visibleCandidates = useMemo(
    () =>
      pendingKindFilter === "all"
        ? candidates
        : candidates.filter((candidate) => candidate.kind === pendingKindFilter),
    [candidates, pendingKindFilter],
  );
  const pendingKindCounts = useMemo(
    () =>
      pendingKindFilters.reduce<Record<PendingKindFilter, number>>(
        (counts, kind) => {
          counts[kind] =
            kind === "all"
              ? candidates.length
              : candidates.filter((candidate) => candidate.kind === kind).length;
          return counts;
        },
        {
          all: 0,
          memory: 0,
          journal: 0,
          reflection: 0,
          entity: 0,
          open_loop: 0,
        },
      ),
    [candidates],
  );
  const deviceEventFilterCounts = useMemo(
    () => {
      const byDevice =
        selectedDeviceId === "all"
          ? deviceEvents
          : deviceEvents.filter((event) => event.deviceId === selectedDeviceId);

      return {
        all: byDevice.length,
        promotable: byDevice.filter((event) => event.promotable && !event.candidateStatus).length,
        in_review: byDevice.filter((event) => !!event.candidateStatus).length,
        operational: byDevice.filter((event) => !event.promotable).length,
      };
    },
    [deviceEvents, selectedDeviceId],
  );
  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId),
    [devices, selectedDeviceId],
  );
  const selectedDeviceEventCount = useMemo(
    () =>
      selectedDeviceId === "all"
        ? deviceEvents.length
        : deviceEvents.filter((event) => event.deviceId === selectedDeviceId).length,
    [deviceEvents, selectedDeviceId],
  );
  const pendingDeviceReviews = useMemo(
    () => deviceEvents.filter((event) => event.promotable && !event.candidateStatus).length,
    [deviceEvents],
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen options={{ title: t("inbox.title") }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1 px-0.5">
          <Text className="text-xl font-semibold">{t("inbox.headerTitle")}</Text>
          <Text className="text-sm text-muted-foreground">{t("inbox.subtitle")}</Text>
        </View>

        <View className="gap-2">
          <Text className="px-0.5 text-sm font-semibold">{t("inbox.pipelineTitle")}</Text>
          <View className="flex-row gap-2">
            <SummaryTile
              active={tab === "pending"}
              label={t("inbox.pipelinePending")}
              value={candidates.length}
              icon="sparkles-outline"
              onPress={() => setTab("pending")}
            />
            <SummaryTile
              active={tab === "saved"}
              label={t("inbox.pipelineSaved")}
              value={memories.length}
              icon="archive-outline"
              onPress={() => setTab("saved")}
            />
          </View>
          <View className="flex-row gap-2">
            <SummaryTile
              active={tab === "reflections"}
              label={t("inbox.pipelineReflections")}
              value={reflections.length}
              icon="prism-outline"
              onPress={() => setTab("reflections")}
            />
            <SummaryTile
              active={tab === "devices"}
              label={t("inbox.pipelineDeviceReviews")}
              value={pendingDeviceReviews}
              icon="hardware-chip-outline"
              onPress={() => {
                setTab("devices");
                setDeviceEventFilter("promotable");
              }}
            />
          </View>
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

        {errorMessage ? (
          <Card className="gap-3 border-destructive/50 bg-destructive/5 p-4">
            <Text className="text-sm font-semibold text-destructive">
              {t("inbox.errorTitle")}
            </Text>
            <Text className="text-sm text-destructive">{errorMessage}</Text>
            <Button variant="outline" size="sm" className="self-start" onPress={refresh}>
              <Ionicons name="refresh-outline" size={14} />
              <Text>{t("inbox.retry")}</Text>
            </Button>
          </Card>
        ) : null}

        {tab === "pending" && candidates.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              {pendingKindFilters.map((kind) => (
                <Button
                  key={kind}
                  variant={pendingKindFilter === kind ? "default" : "outline"}
                  size="sm"
                  onPress={() => setPendingKindFilter(kind)}
                >
                  <Text>{`${t(`inbox.pendingFilter.${kind}`)} ${pendingKindCounts[kind]}`}</Text>
                </Button>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {tab === "pending" && visibleCandidates.map((candidate) => (
          <View
            key={candidate.id}
            onLayout={(event) => {
              candidateOffsetsRef.current.set(candidate.id, event.nativeEvent.layout.y);
            }}
          >
            <CandidateCard
              candidate={candidate}
              highlighted={candidate.id === targetCandidateId}
              onRefresh={refresh}
              onError={handleInboxError}
            />
          </View>
        ))}
        {tab === "saved" &&
          memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} onRefresh={refresh} onError={handleInboxError} />
          ))}
        {tab === "reflections" &&
          reflections.map((reflection) => (
            <ReflectionCard
              key={reflection.id}
              reflection={reflection}
              onRefresh={refresh}
              onError={handleInboxError}
            />
          ))}
        {tab === "devices" && devices.map((device) => <DeviceCard key={device.id} device={device} />)}
        {tab === "devices" && deviceEvents.length ? (
          <View className="gap-2">
            <Text className="px-0.5 text-lg font-semibold">{t("inbox.deviceEvents")}</Text>
            <DeviceSelectionSummary
              selectedDevice={selectedDevice}
              deviceCount={devices.length}
              eventCount={selectedDeviceEventCount}
              pendingReviewCount={deviceEventFilterCounts.promotable}
            />
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-4">
                {deviceEventFilters.map((filter) => (
                  <Button
                    key={filter}
                    variant={deviceEventFilter === filter ? "default" : "outline"}
                    size="sm"
                    onPress={() => setDeviceEventFilter(filter)}
                  >
                    <Text>{`${t(`inbox.deviceEventFilter.${filter}`)} ${deviceEventFilterCounts[filter]}`}</Text>
                  </Button>
                ))}
              </View>
            </ScrollView>
            {!visibleDeviceEvents.length ? (
              <Card className="min-h-24 items-center justify-center px-4">
                <Text variant="muted">{t("inbox.emptyFilteredDeviceEvents")}</Text>
              </Card>
            ) : null}
            {visibleDeviceEvents.map((event) => (
              <DeviceEventCard
                key={event.id}
                event={event}
                onPromoted={() => {
                  refresh();
                  setTab("pending");
                  setPendingKindFilter("all");
                  setTargetCandidateId(`candidate-${event.id}`);
                }}
                onOpenReview={() => {
                  setTab("pending");
                  setPendingKindFilter("all");
                  setTargetCandidateId(event.candidateId);
                }}
                onError={handleInboxError}
              />
            ))}
          </View>
        ) : null}

        {tab === "devices" && devices.length && !deviceEvents.length ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{t("inbox.emptyDeviceEvents")}</Text>
          </Card>
        ) : null}

        {tab === "devices" && !devices.length && !deviceEvents.length ? (
          <Card className="min-h-28 items-center justify-center gap-2 px-4 py-4">
            <Text variant="muted">{emptyText}</Text>
            <OpenDeviceSettingsButton />
          </Card>
        ) : ((tab === "pending" && !visibleCandidates.length) ||
          (tab === "saved" && !memories.length) ||
          (tab === "reflections" && !reflections.length)) ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{emptyText}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
