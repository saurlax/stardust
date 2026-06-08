import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  ActivityIndicator,
  FlatList,
  Image,
  useColorScheme,
  View,
} from "react-native";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChatMessage,
  MemoryCandidateStatus,
  MessageMemoryCandidate,
} from "@/lib/chat/types";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ChatMessagesProps = {
  messages: ChatMessage[];
  sending: boolean;
  onRetryMessage: (message: ChatMessage) => void;
  onUpdateCandidateStatus: (
    messageId: string,
    candidateId: string,
    status: MemoryCandidateStatus,
    nextContent?: string,
  ) => void;
};

const getCandidateTypeLabel = (type: string) => {
  switch (type) {
    case "preference":
      return t("chat.candidateTypePreference");
    case "memory":
      return t("chat.candidateTypeMemory");
    case "task":
      return t("chat.candidateTypeTask");
    case "opinion":
      return t("chat.candidateTypeOpinion");
    default:
      return t("chat.candidateTypeUnknown");
  }
};

function CandidateActions({
  messageId,
  candidate,
  onUpdateCandidateStatus,
}: {
  messageId: string;
  candidate: MessageMemoryCandidate;
  onUpdateCandidateStatus: ChatMessagesProps["onUpdateCandidateStatus"];
}) {
  const [draft, setDraft] = useState(candidate.editedContent ?? candidate.content);
  const [editing, setEditing] = useState(false);

  if (candidate.status === "accepted") {
    return (
      <Text className="text-xs font-semibold text-green-600">
        {t("chat.candidateAccepted")}
      </Text>
    );
  }

  if (candidate.status === "dismissed") {
    return (
      <Text className="text-xs font-semibold text-muted-foreground">
        {t("chat.candidateDismissed")}
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
              setDraft(candidate.editedContent ?? candidate.content);
              setEditing(false);
            }}
          >
            <Text>{t("chat.candidateCancel")}</Text>
          </Button>
          <Button
            size="sm"
            onPress={() => {
              onUpdateCandidateStatus(
                messageId,
                candidate.id,
                "accepted",
                draft.trim() || candidate.content,
              );
              setEditing(false);
            }}
          >
            <Text>{t("chat.candidateSaveEdit")}</Text>
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
        onPress={() => onUpdateCandidateStatus(messageId, candidate.id, "dismissed")}
      >
        <Text>{t("chat.candidateDismiss")}</Text>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onPress={() => setEditing(true)}
      >
        <Text>{t("chat.candidateEdit")}</Text>
      </Button>
      <Button
        size="sm"
        onPress={() =>
          onUpdateCandidateStatus(
            messageId,
            candidate.id,
            "accepted",
            candidate.editedContent ?? candidate.content,
          )
        }
      >
        <Text>{t("chat.candidateAccept")}</Text>
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
        const showMeta = isStreaming || isRetrying || canCopy || canRetry;

        return (
          <View
            className={cn(
              "mb-2.5 flex-row",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <Card
              className={cn(
                "max-w-[80%] gap-0 py-0",
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
                    {item.role === "assistant" && item.candidates?.length ? (
                      <View className="mt-3 gap-2 rounded-lg border border-border bg-muted/60 p-3">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("chat.candidateTitle")}
                        </Text>
                        {item.candidates.map((candidate) => (
                          <View
                            key={candidate.id}
                            className="gap-2 rounded-md border border-border/70 bg-background/80 p-2.5"
                          >
                            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {getCandidateTypeLabel(candidate.type)}
                            </Text>
                            <Text className="text-sm leading-5">{candidate.content}</Text>
                            <CandidateActions
                              messageId={item.id}
                              candidate={candidate}
                              onUpdateCandidateStatus={onUpdateCandidateStatus}
                            />
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
                {showMeta ? (
                  <View className="flex-row items-center gap-0.5">
                    {isLoading ? (
                      <ActivityIndicator size="small" color={mutedColor} />
                    ) : null}
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
                          size={13}
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
                        <Ionicons name="refresh" size={13} color={iconColor} />
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </CardContent>
            </Card>
          </View>
        );
      }}
    />
  );
}
