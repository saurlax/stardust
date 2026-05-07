import * as Clipboard from "expo-clipboard";
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { Button } from "@/components/ui";
import type { ChatMessage } from "@/lib/chat/types";
import { t } from "@/lib/i18n";

type ChatMessagesProps = {
  messages: ChatMessage[];
  sending: boolean;
  onRetryMessage: (message: ChatMessage) => void;
};

export function ChatMessages({
  messages,
  sending,
  onRetryMessage,
}: ChatMessagesProps) {
  const copyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
  };

  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
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
            style={[
              styles.messageRow,
              isUser ? styles.rowRight : styles.rowLeft,
            ]}
          >
            <View
              style={[
                styles.bubble,
                isUser
                  ? styles.bubbleUser
                  : isError
                    ? styles.bubbleError
                    : styles.bubbleAssistant,
              ]}
            >
              {isPending ? (
                <View style={styles.pendingRow}>
                  <ActivityIndicator size="small" color="#6B7280" />
                </View>
              ) : (
                <>
                  {item.content ? (
                    <Text
                      style={[styles.bubbleText, isUser && styles.userText]}
                    >
                      {item.content}
                    </Text>
                  ) : null}
                  {item.imageUri ? (
                    <Image
                      source={{ uri: item.imageUri }}
                      style={styles.messageImage}
                    />
                  ) : null}
                </>
              )}
              {showMeta ? (
                <View style={styles.messageMeta}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#6B7280" />
                  ) : null}
                  {canCopy ? (
                    <Button
                      compact
                      rounded
                      color="neutral"
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.copyMessage")}
                      hitSlop={10}
                      onPress={() => void copyMessage(item.content)}
                      icon="copy-outline"
                    />
                  ) : null}
                  {canRetry ? (
                    <Button
                      compact
                      rounded
                      color="neutral"
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.retryMessage")}
                      hitSlop={10}
                      onPress={() => onRetryMessage(item)}
                      icon="refresh"
                    />
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

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingVertical: 10 },
  messageRow: { flexDirection: "row", marginBottom: 10 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleAssistant: { backgroundColor: "#F3F4F6" },
  bubbleError: { backgroundColor: "#FEF2F2" },
  bubbleUser: { backgroundColor: "#2563EB" },
  bubbleText: { fontSize: 16, lineHeight: 20, color: "#111827" },
  userText: { color: "#FFFFFF" },
  pendingRow: {
    minWidth: 24,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  messageImage: {
    marginTop: 8,
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  messageMeta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
