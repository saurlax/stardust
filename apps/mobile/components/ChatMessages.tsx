import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  useColorScheme,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChatMessage,
  MemoryCandidateStatus,
  MessageToolCard,
} from "@/lib/chat/types";
import { t } from "@/lib/i18n";
import { getKnowledgeTypeLabel } from "@/lib/memoryLabels";
import { cn } from "@/lib/utils";

type ChatMessagesProps = {
  messages: ChatMessage[];
  sending: boolean;
  onRetryMessage: (message: ChatMessage) => void;
  onUpdateCandidateStatus: (
    messageId: string,
    cardId: string,
    status: MemoryCandidateStatus,
    nextContent?: string,
  ) => void;
};

const getCardTypeLabel = (type: string) => {
  switch (type) {
    case "save_memory":
      return t("chat.cardTypeSaveMemory");
    case "append_journal":
      return t("chat.cardTypeAppendJournal");
    case "link_entity":
      return t("chat.cardTypeLinkEntity");
    case "suggest_reflection":
      return t("chat.cardTypeSuggestReflection");
    case "mark_open_loop":
      return t("chat.cardTypeMarkOpenLoop");
    default:
      return t("chat.cardTypeUnknown");
  }
};

const getRelationSummary = (card: MessageToolCard) =>
  card.payload.relationTarget
    ? `${card.payload.relationType ?? t("chat.cardRelationDefault")} · ${card.payload.relationTarget}`
    : undefined;

const getContextTypeLabel = (type?: string) => {
  if (type === "open_loop") return t("chat.memoryContextOpenLoop");
  return type ?? t("chat.memoryContextUnknown");
};

const getContextSourceLabel = (
  item: NonNullable<ChatMessage["memoryContext"]>[number],
) => {
  switch (item.source) {
    case "memory":
      return t("journal.memoryEntryPrefix");
    case "episode":
      return t("journal.episodeEntryPrefix");
    case "reflection":
      return t("journal.reflectionEntryPrefix");
    case "entity":
      return t("journal.entityEntryPrefix");
    case "relation":
      return t("journal.relationEntryPrefix");
  }
};

function MemoryContextSummary({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const context = message.memoryContext ?? [];
  if (!message.memoryContextCount) return null;

  const openContextItem = (item: NonNullable<ChatMessage["memoryContext"]>[number]) => {
    if (item.source === "episode") {
      router.push({
        pathname: "/journal",
        params: { episodeId: item.id },
      } as Href);
      return;
    }
    router.push({
      pathname: "/memory",
      params: {
        nodeId: item.nodeId ?? (
          item.source === "memory"
            ? `memory-${item.id}`
            : item.source === "entity"
              ? `entity-${item.id}`
              : item.source === "relation"
                ? "root"
                : `reflection-${item.id}`
        ),
      },
    } as Href);
  };

  return (
    <View className="mt-2 gap-2 rounded-md bg-muted/60 px-2.5 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto justify-start gap-1.5 px-0 py-0"
        onPress={() => setExpanded((current) => !current)}
      >
        <Ionicons name="sparkles-outline" size={12} />
        <Text className="text-xs text-muted-foreground">
          {`${message.memoryContextCount} ${t("chat.memoryContextUsed")}`}
        </Text>
        {context.length ? (
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={12} />
        ) : null}
      </Button>
      {expanded && context.length ? (
        <View className="gap-1.5">
          {context.map((item) => (
            <View key={`${item.source}-${item.id}`} className="gap-0.5 border-t border-border/60 pt-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto items-start justify-start px-0 py-0"
                onPress={() => openContextItem(item)}
              >
                <View className="gap-0.5">
                  <Text className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {getContextSourceLabel(item)} ·{" "}
                    {getKnowledgeTypeLabel(item.source, item.type) ||
                      getContextTypeLabel(item.type)}{" "}
                    {item.source === "memory" && typeof item.importance === "number"
                      ? `· ${t("inbox.importance")} ${item.importance}`
                      : ""}
                    {item.hasMedia ? `· ${t("chat.memoryContextMedia")}` : ""}
                    {item.isScreenOff ? `· ${t("chat.memoryContextScreenOff")}` : ""}
                    · {item.createdAt.slice(0, 10)}
                  </Text>
                  {item.title ? (
                    <Text className="text-xs font-semibold leading-4 text-muted-foreground">
                      {item.title}
                    </Text>
                  ) : null}
                  <Text className="text-xs leading-4 text-muted-foreground">
                    {item.content.length > 120 ? `${item.content.slice(0, 120)}...` : item.content}
                  </Text>
                  {item.contextNote ? (
                    <Text className="text-[11px] leading-4 text-muted-foreground">
                      {item.contextNote}
                    </Text>
                  ) : null}
                  {item.rationale ? (
                    <Text className="text-[11px] leading-4 text-muted-foreground">
                      {t("inbox.rationale")}: {item.rationale}
                    </Text>
                  ) : null}
                </View>
              </Button>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ToolCardActions({
  messageId,
  card,
  onUpdateCandidateStatus,
}: {
  messageId: string;
  card: MessageToolCard;
  onUpdateCandidateStatus: ChatMessagesProps["onUpdateCandidateStatus"];
}) {
  const [draft, setDraft] = useState(card.payload.content);
  const [editing, setEditing] = useState(false);

  if (card.status === "accepted") {
    return (
      <Text className="text-xs font-semibold text-green-600">
        {t("chat.cardAccepted")}
      </Text>
    );
  }

  if (card.status === "dismissed") {
    return (
      <Text className="text-xs font-semibold text-muted-foreground">
        {t("chat.cardDismissed")}
      </Text>
    );
  }

  if (editing) {
    return (
      <View className="gap-2">
        <Textarea
          value={draft}
          onChangeText={setDraft}
          className="min-h-20 rounded-md bg-background"
          numberOfLines={3}
        />
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              setDraft(card.payload.content);
              setEditing(false);
            }}
          >
            <Text>{t("chat.cardCancel")}</Text>
          </Button>
          <Button
            size="sm"
            onPress={() => {
              onUpdateCandidateStatus(
                messageId,
                card.id,
                "accepted",
                draft.trim() || card.payload.content,
              );
              setEditing(false);
            }}
          >
            <Text>{t("chat.cardSaveEdit")}</Text>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onPress={() =>
          router.push(`/inbox?candidateId=${encodeURIComponent(card.id)}` as Href)
        }
      >
        <Ionicons name="file-tray-full-outline" size={14} />
        <Text>{t("chat.cardOpenInbox")}</Text>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onPress={() => onUpdateCandidateStatus(messageId, card.id, "dismissed")}
      >
        <Text>{t("chat.cardDismiss")}</Text>
      </Button>
      <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
        <Text>{t("chat.cardEdit")}</Text>
      </Button>
      <Button
        size="sm"
        onPress={() =>
          onUpdateCandidateStatus(
            messageId,
            card.id,
            "accepted",
            card.payload.content,
          )
        }
      >
        <Text>{t("chat.cardAccept")}</Text>
      </Button>
    </View>
  );
}

export function ChatMessages({
  messages,
  sending,
  onRetryMessage,
  onUpdateCandidateStatus,
}: ChatMessagesProps) {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const mutedColor = colorScheme === "dark" ? "#A3A3A3" : "#737373";

  const copyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
  };

  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}
      renderItem={({ item }) => {
        const isUser = item.role === "user";
        const isError = item.status === "error";
        const isPending = item.status === "pending";
        const isStreaming = item.status === "streaming";
        const isRetrying = item.status === "retrying";
        const isLoading = isPending || isStreaming || isRetrying;
        const canCopy = item.role === "assistant" && !isLoading;
        const canRetry =
          item.role === "assistant" &&
          !isLoading &&
          (!!item.request?.prompt || !!item.request?.imageUri) &&
          !sending;
        const showActions = canCopy || canRetry;

        return (
          <View
            className={cn(
              "mb-2.5 flex-row",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <View
              className={cn(
                "max-w-[80%]",
                isUser ? "items-end" : "items-start",
              )}
            >
              <Card
                className={cn(
                  "gap-0 py-0",
                  isUser && "bg-primary",
                  isError && "bg-destructive/10",
                )}
              >
                <CardContent className="px-4 py-3">
                  {isPending ? (
                    <View className="min-h-5 min-w-6 items-center justify-center">
                      <ActivityIndicator size="small" color={mutedColor} />
                    </View>
                  ) : (
                    <>
                      {item.content ? (
                        <Text
                          className={cn(
                            "text-base leading-5",
                            isUser && "text-primary-foreground",
                          )}
                        >
                          {item.content}
                        </Text>
                      ) : null}
                      {isError && item.error ? (
                        <Text className="text-sm leading-5 text-destructive">
                          {item.error}
                        </Text>
                      ) : null}
                      {item.imageUri ? (
                        <Image
                          source={{ uri: item.imageUri }}
                          className="mt-2 h-[200px] w-[200px] rounded-md bg-muted"
                        />
                      ) : null}
                      {item.role === "assistant" ? <MemoryContextSummary message={item} /> : null}
                      {item.role === "assistant" && item.toolCards?.length ? (
                        <View className="mt-3 gap-2 rounded-lg border border-border bg-muted/60 p-3">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("chat.cardTitle")}
                          </Text>
                          {item.toolCards.map((card) => {
                            const relationSummary = getRelationSummary(card);
                            return (
                              <View
                                key={card.id}
                                className="gap-2 rounded-md border border-border/70 bg-background/80 p-2.5"
                              >
                                <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {getCardTypeLabel(card.type)}
                                </Text>
                                <Text className="text-sm font-medium leading-5">
                                  {card.title}
                                </Text>
                                <Text className="text-sm leading-5">
                                  {card.payload.content}
                                </Text>
                                {typeof card.payload.importance === "number" ? (
                                  <View className="gap-1 rounded-md bg-muted/70 px-2.5 py-2">
                                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {t("inbox.importance")}
                                    </Text>
                                    <Text className="text-xs leading-4 text-muted-foreground">
                                      {card.payload.importance}
                                    </Text>
                                  </View>
                                ) : null}
                                {card.payload.rationale ? (
                                  <View className="gap-1 rounded-md bg-muted/70 px-2.5 py-2">
                                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {t("chat.cardRationale")}
                                    </Text>
                                    <Text className="text-xs leading-4 text-muted-foreground">
                                      {card.payload.rationale}
                                    </Text>
                                  </View>
                                ) : null}
                                {relationSummary ? (
                                  <View className="gap-1 rounded-md bg-muted/70 px-2.5 py-2">
                                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {t("chat.cardRelation")}
                                    </Text>
                                    <Text className="text-xs leading-4 text-muted-foreground">
                                      {relationSummary}
                                    </Text>
                                  </View>
                                ) : null}
                                <ToolCardActions
                                  messageId={item.id}
                                  card={card}
                                  onUpdateCandidateStatus={
                                    onUpdateCandidateStatus
                                  }
                                />
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                      {isStreaming || isRetrying ? (
                        <View className="mt-2 flex-row items-center">
                          <ActivityIndicator size="small" color={mutedColor} />
                        </View>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>

              {showActions ? (
                <View className="mt-1 flex-row items-center gap-0.5 px-1">
                  {canCopy ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.copyMessage")}
                      hitSlop={10}
                      onPress={() => void copyMessage(item.content)}
                    >
                      <Ionicons
                        name="copy-outline"
                        size={14}
                        color={iconColor}
                      />
                    </Button>
                  ) : null}
                  {canRetry ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.retryMessage")}
                      hitSlop={10}
                      onPress={() => onRetryMessage(item)}
                    >
                      <Ionicons name="refresh" size={14} color={iconColor} />
                    </Button>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}
