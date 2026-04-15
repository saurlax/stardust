import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ChatMessage } from "@/lib/chat/types";

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
          !!item.request?.prompt &&
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
                <Text style={[styles.bubbleText, isUser && styles.userText]}>
                  {item.content}
                </Text>
              )}
              {showMeta ? (
                <View style={styles.messageMeta}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#6B7280" />
                  ) : null}
                  {canCopy ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy message"
                      hitSlop={10}
                      onPress={() => void copyMessage(item.content)}
                      style={styles.metaIconButton}
                    >
                      <Ionicons name="copy-outline" size={14} color="#6B7280" />
                    </Pressable>
                  ) : null}
                  {canRetry ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry message"
                      hitSlop={10}
                      onPress={() => onRetryMessage(item)}
                      style={styles.metaIconButton}
                    >
                      <Ionicons name="refresh" size={14} color="#6B7280" />
                    </Pressable>
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
  messageMeta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaIconButton: {
    alignSelf: "flex-start",
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
