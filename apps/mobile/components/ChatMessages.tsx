import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { ActivityIndicator, FlatList, Image, useColorScheme, View } from "react-native";
import { useState } from "react";

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
    default:
      return t("chat.cardTypeUnknown");
  }
};

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
    return <Text className="text-xs font-semibold text-green-600">{t("chat.cardAccepted")}</Text>;
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
    <View className="flex-row gap-2">
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
          onUpdateCandidateStatus(messageId, card.id, "accepted", card.payload.content)
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
          <View className={cn("mb-2.5 flex-row", isUser ? "justify-end" : "justify-start")}>
            <View className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
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
                        <Text className="text-sm leading-5 text-destructive">{item.error}</Text>
                      ) : null}
                      {item.imageUri ? (
                        <Image
                          source={{ uri: item.imageUri }}
                          className="mt-2 h-[200px] w-[200px] rounded-md bg-muted"
                        />
                      ) : null}
                      {item.role === "assistant" && item.toolCards?.length ? (
                        <View className="mt-3 gap-2 rounded-lg border border-border bg-muted/60 p-3">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("chat.cardTitle")}
                          </Text>
                          {item.toolCards.map((card) => (
                            <View
                              key={card.id}
                              className="gap-2 rounded-md border border-border/70 bg-background/80 p-2.5"
                            >
                              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {getCardTypeLabel(card.type)}
                              </Text>
                              <Text className="text-sm font-medium leading-5">{card.title}</Text>
                              <Text className="text-sm leading-5">{card.payload.content}</Text>
                              <ToolCardActions
                                messageId={item.id}
                                card={card}
                                onUpdateCandidateStatus={onUpdateCandidateStatus}
                              />
                            </View>
                          ))}
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
                      <Ionicons name="copy-outline" size={13} color={iconColor} />
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
                      <Ionicons name="refresh" size={13} color={iconColor} />
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
