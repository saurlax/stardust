import { useChat } from "@ai-sdk/react";
import { Ionicons } from "@expo/vector-icons";
import { DefaultChatTransport } from "ai";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { fetch as expoFetch } from "expo/fetch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatMessages } from "@/components/ChatMessages";
import { ChatPrompt } from "@/components/ChatPrompt";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useConfig } from "@/context/config";
import { getApiBaseUrl } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat/types";
import { t } from "@/lib/i18n";

const DEFAULT_IMAGE_PROMPT = t("chat.defaultImagePrompt");

export default function Index() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const { config, ready } = useConfig();
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string>();
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string>();
  const chatIdRef = useRef<string | null>(null);
  const handledShareRef = useRef<string | undefined>(undefined);
  const [lastError, setLastError] = useState<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${getApiBaseUrl(config.apiBaseURL)}/api/v1/chat`,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMsg = messages[messages.length - 1];
          const textPart = lastMsg?.parts?.find(
            (p): p is { type: "text"; text: string } => p.type === "text",
          );
          return {
            body: {
              chatId: chatIdRef.current ?? undefined,
              content: textPart?.text ?? "",
              stream: true,
            },
          };
        },
      }),
    [config.apiBaseURL],
  );

  const {
    messages: uiMessages,
    sendMessage,
    status,
  } = useChat({
    transport,
    onData: (dataPart) => {
      // 接收后端回传的 chatId（首次发消息时后端自动创建会话）
      if (dataPart.type === "data-chatId" && !chatIdRef.current) {
        chatIdRef.current = dataPart.data as string;
      }
    },
    onError: (error) => {
      setLastError(error.message);
    },
  });

  const sending = status === "streaming" || status === "submitted";

  // 将 UIMessage 转为 ChatMessage 用于渲染
  const messages: ChatMessage[] = [
    {
      id: "m1",
      role: "assistant",
      content: t("chat.assistantGreeting"),
      status: "done",
    },
    ...uiMessages.map((msg, idx) => {
      const isLast = idx === uiMessages.length - 1;
      const isAssistant = msg.role === "assistant";
      let msgStatus: ChatMessage["status"] = "done";
      let msgError: string | undefined;
      if (isLast && isAssistant) {
        if (status === "streaming") msgStatus = "streaming";
        else if (status === "submitted") msgStatus = "pending";
        else if (status === "error" && lastError) {
          msgStatus = "error";
          msgError = lastError;
        }
      }
      const textPart = msg.parts?.find(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      return {
        id: msg.id,
        role: msg.role as ChatMessage["role"],
        content: textPart?.text ?? "",
        status: msgStatus,
        error: msgError,
      } satisfies ChatMessage;
    }),
    ...(status === "submitted" ||
    (status === "error" &&
      (uiMessages.length === 0 ||
        uiMessages[uiMessages.length - 1]?.role !== "assistant"))
      ? [
          {
            id: "pending-assistant",
            role: "assistant" as const,
            content: "",
            status: (status === "error"
              ? "error"
              : "pending") as ChatMessage["status"],
            error: status === "error" ? (lastError ?? undefined) : undefined,
          },
        ]
      : []),
  ];

  const sendPrompt = useCallback(
    (prompt: string, imageUri?: string, imageMimeType?: string) => {
      const trimmed = prompt.trim();
      const effectivePrompt = trimmed || (imageUri ? DEFAULT_IMAGE_PROMPT : "");
      if (!effectivePrompt || sending || !ready) return;

      setLastError(null);
      setText("");
      setSelectedImageUri(undefined);
      setSelectedImageMimeType(undefined);

      type FilePart = { type: "file"; url: string; mediaType: string };
      type TextPart = { type: "text"; text: string };
      const parts: (TextPart | FilePart)[] = [];

      if (imageUri && imageMimeType) {
        parts.push({ type: "file", url: imageUri, mediaType: imageMimeType });
      }
      parts.push({ type: "text", text: effectivePrompt });

      sendMessage({ role: "user", parts });
    },
    [ready, sendMessage, sending],
  );

  const sendText = () =>
    sendPrompt(text, selectedImageUri, selectedImageMimeType);
  const sendVoicePlaceholder = () => sendPrompt(t("chat.voiceMessage"));

  const retryMessage = (message: ChatMessage) => {
    if (!message.request?.prompt) return;
    sendPrompt(message.request.prompt, message.request.imageUri);
  };

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
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
      /* ignore */
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
      /* ignore */
    }
  };

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || sending || !ready) return;
    const signature = JSON.stringify(shareIntent);
    if (handledShareRef.current === signature) return;
    handledShareRef.current = signature;
    const sharedImage = shareIntent.files?.find((file) =>
      file.mimeType.startsWith("image/"),
    );
    if (sharedImage?.path) {
      setSelectedImageUri(sharedImage.path);
      setSelectedImageMimeType(sharedImage.mimeType || "image/jpeg");
    }
    if (shareIntent.text || shareIntent.webUrl) {
      setText(shareIntent.text || shareIntent.webUrl || "");
    }
    resetShareIntent();
  }, [hasShareIntent, ready, resetShareIntent, sending, shareIntent]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("chat.title"),
          headerTitleAlign: "center",
          headerTitle: () => (
            <View className="items-center justify-center">
              <Text className="text-center text-[22px] font-bold">
                {t("chat.title")}
              </Text>
              <Text className="mt-0.5 text-center text-xs text-muted-foreground">
                {ready ? t("chat.providerReady") : t("chat.providerLoading")}
              </Text>
            </View>
          ),
          headerLeft: () => (
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("chat.openPersonalPage")}
              hitSlop={10}
              onPress={() => router.push("/personal")}
              variant="ghost"
              size="icon"
              className="rounded-full"
            >
              <Ionicons name="menu" size={22} color={iconColor} />
            </Button>
          ),
          headerRight: () => (
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("chat.openSettings")}
              hitSlop={10}
              onPress={() => router.push("/settings")}
              variant="ghost"
              size="icon"
              className="rounded-full"
            >
              <Ionicons name="settings-outline" size={22} color={iconColor} />
            </Button>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
