import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Ionicons } from "@expo/vector-icons";
import { type ModelMessage, streamText } from "ai";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useRef, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatMessages } from "@/components/ChatMessages";
import { ChatPrompt } from "@/components/ChatPrompt";
import { useConfig } from "@/context/config";
import type { ChatMessage, MessageRole } from "@/lib/chat/types";

const DEFAULT_IMAGE_PROMPT = "解释图片";

const readImageBinary = async (uri: string) => {
  const response = await expoFetch(uri);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

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
  const [selectedImageUri, setSelectedImageUri] = useState<string>();
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string>();
  const [sending, setSending] = useState(false);
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

  const toModelMessages = async (
    inputMessages: ChatMessage[],
  ): Promise<ModelMessage[]> => {
    const mapped = await Promise.all(
      inputMessages
        .filter(
          (message): message is ChatMessage & { role: MessageRole } =>
            message.role === "user" ||
            (message.role === "assistant" && message.status !== "error"),
        )
        .map(async (message) => {
          if (message.role === "assistant") {
            return {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: message.content }],
            };
          }

          const content = [] as Array<
            | { type: "text"; text: string }
            | { type: "image"; image: Uint8Array; mediaType?: string }
          >;

          if (message.content) {
            content.push({ type: "text", text: message.content });
          }

          if (message.imageUri) {
            const imageBytes = await readImageBinary(message.imageUri);
            content.push({
              type: "image",
              image: imageBytes,
              mediaType: message.imageMimeType,
            });
          }

          if (!content.length) {
            content.push({ type: "text", text: "" });
          }

          return {
            role: "user" as const,
            content,
          };
        }),
    );

    return mapped;
  };

  const sendPrompt = async (
    prompt: string,
    reuseUserMessage = false,
    replaceMessageId?: string,
  ) => {
    const trimmed = prompt.trim();
    const imageUri = selectedImageUri;
    const imageMimeType = selectedImageMimeType;
    const effectivePrompt = trimmed || (imageUri ? DEFAULT_IMAGE_PROMPT : "");
    if ((!effectivePrompt && !reuseUserMessage) || sending || !ready) return;

    if (!config.apiKey || !config.baseURL || !config.model) {
      const errorMessage: ChatMessage = {
        id: `${Date.now()}-e`,
        role: "assistant",
        content: "OpenAI-compatible settings are incomplete.",
        status: "error",
        error: "OpenAI-compatible settings are incomplete.",
        request: { prompt: effectivePrompt, imageUri },
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
      content: effectivePrompt,
      status: "done",
      imageUri,
      imageMimeType,
    };
    const pendingMessage: ChatMessage = {
      id: `${Date.now()}-p`,
      role: "assistant",
      content: "",
      status: "pending",
      request: { prompt: effectivePrompt, imageUri },
    };
    const nextMessages = reuseUserMessage
      ? messagesRef.current
      : [...messagesRef.current, userMessage, pendingMessage];
    const targetMessageId = replaceMessageId ?? pendingMessage.id;

    setText("");
    setSelectedImageUri(undefined);
    setSelectedImageMimeType(undefined);
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
        messages: await toModelMessages(nextMessages),
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
          request: { prompt: effectivePrompt, imageUri },
        }));
      }

      replaceMessage(targetMessageId, {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: streamedText.trim() || "No response.",
        status: "done",
        request: { prompt: effectivePrompt, imageUri },
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
        request: { prompt: effectivePrompt, imageUri },
      };
      replaceMessage(targetMessageId, errorMessage);
    } finally {
      setSending(false);
    }
  };

  const sendText = () => sendPrompt(text);

  const sendVoicePlaceholder = () => sendPrompt("Voice message");

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      addMessage({
        id: `${Date.now()}-camera-permission`,
        role: "assistant",
        content: "Camera permission is required to take photos.",
        status: "error",
      });
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.55,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        if (!asset) return;
        setSelectedImageUri(asset.uri);
        setSelectedImageMimeType(asset.mimeType || "image/jpeg");
      }
    } catch {
      addMessage({
        id: `${Date.now()}-camera-failed`,
        role: "assistant",
        content: "Failed to open camera.",
        status: "error",
      });
    }
  };

  const openLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.55,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        if (!asset) return;
        setSelectedImageUri(asset.uri);
        setSelectedImageMimeType(asset.mimeType || "image/jpeg");
      }
    } catch {
      addMessage({
        id: `${Date.now()}-library-failed`,
        role: "assistant",
        content: "Failed to open image library.",
        status: "error",
      });
    }
  };

  const retryMessage = (message: ChatMessage) => {
    if (!message.request?.prompt && !message.request?.imageUri) return;
    replaceMessage(message.id, {
      ...message,
      status: "retrying",
    });
    void sendPrompt(message.request?.prompt || "", true, message.id);
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        <ChatMessages
          messages={messages}
          sending={sending}
          onRetryMessage={retryMessage}
        />

        <ChatPrompt
          inputMode={inputMode}
          text={text}
          sending={sending}
          selectedImageUri={selectedImageUri}
          onChangeText={setText}
          onInputModeChange={setInputMode}
          onSendText={sendText}
          onSendVoice={sendVoicePlaceholder}
          onClearSelectedImage={() => {
            setSelectedImageUri(undefined);
            setSelectedImageMimeType(undefined);
          }}
          onPressCamera={() => void openCamera()}
          onPressAdd={() => void openLibrary()}
        />
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
});
