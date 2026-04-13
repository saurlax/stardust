import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Ionicons } from "@expo/vector-icons";
import { streamText } from "ai";
import * as Clipboard from "expo-clipboard";
import { router, Stack } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useConfig } from "../context/config";

type MessageRole = "user" | "assistant";
type MessageStatus = "pending" | "streaming" | "done" | "error" | "retrying";

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  error?: string;
  request?: {
    prompt: string;
  };
};

const toModelMessages = (messages: ChatMessage[]) =>
  messages
    .filter(
      (message): message is ChatMessage & { role: MessageRole } =>
        message.role === "user" ||
        (message.role === "assistant" && message.status !== "error"),
    )
    .map((message) => ({
      role: message.role,
      content: [{ type: "text" as const, text: message.content }],
    }));

export default function Index() {
  const { config, ready } = useConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m1",
      role: "assistant",
      content: "Hi! How can I help?",
      status: "done",
    },
  ]);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const replaceMessage = (id: string, next: ChatMessage) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? next : message)),
    );
  };

  const updateMessage = (
    id: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? updater(message) : message)),
    );
  };

  const sendPrompt = async (
    prompt: string,
    reuseUserMessage = false,
    replaceMessageId?: string,
  ) => {
    const trimmed = prompt.trim();
    if (!trimmed || sending || !ready) return;

    if (!config.apiKey || !config.baseURL || !config.model) {
      const errorMessage: ChatMessage = {
        id: `${Date.now()}-e`,
        role: "assistant",
        content: "OpenAI-compatible settings are incomplete.",
        status: "error",
        error: "OpenAI-compatible settings are incomplete.",
        request: { prompt: trimmed },
      };
      if (replaceMessageId) {
        replaceMessage(replaceMessageId, errorMessage);
      } else {
        addMessage(errorMessage);
      }
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      content: trimmed,
      status: "done",
    };
    const pendingMessage: ChatMessage = {
      id: `${Date.now()}-p`,
      role: "assistant",
      content: "",
      status: "pending",
      request: { prompt: trimmed },
    };
    const nextMessages = reuseUserMessage
      ? messagesRef.current
      : [...messagesRef.current, userMessage, pendingMessage];
    const targetMessageId = replaceMessageId ?? pendingMessage.id;

    setText("");
    if (!reuseUserMessage) {
      setMessages(nextMessages);
    }
    setSending(true);

    try {
      const provider = createOpenAICompatible({
        name: "openai-compact",
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        fetch: expoFetch as any,
      });
      const result = streamText({
        model: provider(config.model),
        messages: toModelMessages(nextMessages),
        temperature: Number(config.temperature) || 0.7,
      });
      let streamedText = "";

      for await (const delta of result.textStream) {
        streamedText += delta;
        updateMessage(targetMessageId, (message) => ({
          ...message,
          role: "assistant",
          content: streamedText,
          status: "streaming",
          error: undefined,
          request: { prompt: trimmed },
        }));
      }

      replaceMessage(targetMessageId, {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: streamedText.trim() || "No response.",
        status: "done",
        request: { prompt: trimmed },
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Request failed.";
      const errorMessage: ChatMessage = {
        id: `${Date.now()}-e`,
        role: "assistant",
        content: message,
        status: "error",
        error: message,
        request: { prompt: trimmed },
      };
      replaceMessage(targetMessageId, errorMessage);
    } finally {
      setSending(false);
    }
  };

  const sendText = () => sendPrompt(text);

  const sendVoicePlaceholder = () => sendPrompt("Voice message");

  const copyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
  };

  const retryMessage = (message: ChatMessage) => {
    if (!message.request?.prompt) return;
    replaceMessage(message.id, {
      ...message,
      status: "retrying",
    });
    void sendPrompt(message.request.prompt, true, message.id);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text style={styles.title}>Chat</Text>
              <Text style={styles.subtitle}>
                {ready ? "OpenAI-compatible provider" : "Loading settings..."}
              </Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              hitSlop={10}
              onPress={() => router.push("/settings" as never)}
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={22} color="#111827" />
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
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
                    <Text
                      style={[styles.bubbleText, isUser && styles.userText]}
                    >
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
                          <Ionicons
                            name="copy-outline"
                            size={14}
                            color="#6B7280"
                          />
                        </Pressable>
                      ) : null}
                      {canRetry ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Retry message"
                          hitSlop={10}
                          onPress={() => retryMessage(item)}
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

        <View style={styles.inputBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              inputMode === "text"
                ? "Switch to voice input"
                : "Switch to typing"
            }
            hitSlop={10}
            onPress={() => {
              setInputMode((mode) => {
                const next = mode === "text" ? "voice" : "text";
                if (next === "text") {
                  setTimeout(() => inputRef.current?.focus(), 50);
                }
                return next;
              });
            }}
            style={[styles.iconButton, styles.leftButton]}
          >
            <Ionicons
              name={inputMode === "text" ? "mic" : "keypad"}
              size={22}
              color="#111827"
            />
          </Pressable>

          {inputMode === "text" ? (
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={sending ? "Thinking..." : "Message"}
              placeholderTextColor="#9CA3AF"
              style={styles.textInput}
              returnKeyType="send"
              onSubmitEditing={sendText}
              blurOnSubmit={false}
              editable={!sending}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voice input"
              onPress={sendVoicePlaceholder}
              style={styles.voiceButton}
            >
              <Text style={styles.voiceText}>Hold to talk</Text>
            </Pressable>
          )}

          <View style={styles.rightActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Camera"
              hitSlop={10}
              style={styles.iconButton}
              onPress={() => {}}
            >
              <Ionicons name="camera" size={22} color="#111827" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add"
              hitSlop={10}
              style={[styles.iconButton, styles.rightButton]}
              onPress={() => {}}
            >
              <Ionicons name="add" size={26} color="#111827" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 2, fontSize: 12, color: "#6B7280" },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
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
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    color: "#111827",
    fontSize: 16,
  },
  voiceButton: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
  },
  voiceText: { fontSize: 16, color: "#111827" },
  rightActions: { flexDirection: "row", alignItems: "center" },
  leftButton: { marginRight: 8 },
  rightButton: { marginLeft: 6 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
});
