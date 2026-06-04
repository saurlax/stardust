import { useChat } from "@ai-sdk/react";
import { Ionicons } from "@expo/vector-icons";
import { DefaultChatTransport, type UIMessage } from "ai";
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
import { createApiFetch } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat/types";
import { t } from "@/lib/i18n";

const DEFAULT_IMAGE_PROMPT = t("chat.defaultImagePrompt");
const GREETING_ID = "m1";

type RequestContext = {
  assistantId: string;
  request: NonNullable<ChatMessage["request"]>;
};

const isTextPart = (part: unknown): part is { type: "text"; text: string } =>
  typeof part === "object" &&
  part !== null &&
  "type" in part &&
  part.type === "text" &&
  "text" in part &&
  typeof part.text === "string";

const getMessageText = (parts?: unknown[]) =>
  parts?.find(isTextPart)?.text ?? "";

const createTransportMessages = (messages: ChatMessage[]): UIMessage[] =>
  messages
    .filter((message) => {
      if (message.id === GREETING_ID) return false;
      if (message.status === "error" || message.status === "pending") {
        return false;
      }

      if (message.role === "assistant") {
        return message.status === "done" || message.status === "streaming";
      }

      return true;
    })
    .map((message) => {
      const parts: (
        | { type: "text"; text: string }
        | { type: "file"; url: string; mediaType: string }
      )[] = [];

      if (message.role === "user" && message.imageUri && message.imageMimeType) {
        parts.push({
          type: "file",
          url: message.imageUri,
          mediaType: message.imageMimeType,
        });
      }

      if (message.content) {
        parts.push({ type: "text", text: message.content });
      }

      return {
        id: message.id,
        role: message.role,
        parts,
      } satisfies UIMessage;
    });

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: GREETING_ID,
      role: "assistant",
      content: t("chat.assistantGreeting"),
      status: "done",
    },
  ]);
  const chatIdRef = useRef<string | null>(null);
  const handledShareRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef(messages);
  const activeRequestRef = useRef<RequestContext | null>(null);
  const apiBaseUrlRef = useRef(config.apiBaseURL);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    apiBaseUrlRef.current = config.apiBaseURL;
  }, [config.apiBaseURL]);

  const replaceMessage = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? updater(message) : message,
        ),
      );
    },
    [],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/v1/chat",
        fetch: createApiFetch(
          () => apiBaseUrlRef.current,
          expoFetch as unknown as typeof globalThis.fetch,
        ),
        prepareSendMessagesRequest: ({ messages: transportMessages }) => {
          const lastMessage = transportMessages[transportMessages.length - 1];
          return {
            body: {
              chatId: chatIdRef.current ?? undefined,
              content: getMessageText(lastMessage?.parts),
              stream: true,
            },
          };
        },
      }),
    [],
  );

  const {
    messages: uiMessages,
    sendMessage,
    setMessages: setTransportMessages,
    status,
  } = useChat({
    transport,
    onData: (dataPart) => {
      if (dataPart.type === "data-chatId" && !chatIdRef.current) {
        chatIdRef.current = dataPart.data as string;
      }
    },
    onError: (error) => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest) return;

      replaceMessage(activeRequest.assistantId, (message) => ({
        ...message,
        status: "error",
        error: error.message,
      }));

      activeRequestRef.current = null;
    },
    onFinish: ({ message }) => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest) return;

      const content = getMessageText(message.parts);
      replaceMessage(activeRequest.assistantId, (current) => ({
        ...current,
        id: message.id,
        content,
        status: "done",
        error: undefined,
      }));

      activeRequestRef.current = null;
    },
  });

  const sending = status === "streaming" || status === "submitted";

  useEffect(() => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;

    const assistantMessage = [...uiMessages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!assistantMessage) return;

    const content = getMessageText(assistantMessage.parts);
    const nextStatus =
      status === "streaming"
        ? "streaming"
        : status === "submitted"
          ? "pending"
          : "done";

    replaceMessage(activeRequest.assistantId, (current) => ({
      ...current,
      id: assistantMessage.id,
      content,
      status: current.status === "error" ? current.status : nextStatus,
      error: current.status === "error" ? current.error : undefined,
    }));

    activeRequestRef.current = {
      ...activeRequest,
      assistantId: assistantMessage.id,
    };
  }, [replaceMessage, status, uiMessages]);

  const sendPrompt = useCallback(
    (prompt: string, imageUri?: string, imageMimeType?: string) => {
      const trimmed = prompt.trim();
      const effectivePrompt = trimmed || (imageUri ? DEFAULT_IMAGE_PROMPT : "");
      if (!effectivePrompt || sending || !ready) return;

      const request: NonNullable<ChatMessage["request"]> = {
        prompt: effectivePrompt,
        imageUri,
        imageMimeType,
      };
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: effectivePrompt,
        status: "done",
        imageUri,
        imageMimeType,
      };

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        status: "pending",
        request,
      };

      activeRequestRef.current = {
        assistantId: assistantMessage.id,
        request,
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setTransportMessages(
        createTransportMessages(messagesRef.current).filter(
          (message) => message.role !== "assistant" || message.parts.length > 0,
        ),
      );

      setText("");
      setSelectedImageUri(undefined);
      setSelectedImageMimeType(undefined);

      const parts: (
        | { type: "text"; text: string }
        | { type: "file"; url: string; mediaType: string }
      )[] = [];

      if (imageUri && imageMimeType) {
        parts.push({ type: "file", url: imageUri, mediaType: imageMimeType });
      }
      parts.push({ type: "text", text: effectivePrompt });

      void sendMessage({ role: "user", parts });
    },
    [ready, sendMessage, sending, setTransportMessages],
  );

  const sendText = () =>
    sendPrompt(text, selectedImageUri, selectedImageMimeType);
  const sendVoicePlaceholder = () => sendPrompt(t("chat.voiceMessage"));

  const retryMessage = (message: ChatMessage) => {
    if (!message.request?.prompt) return;

    const targetIndex = messagesRef.current.findIndex((item) => item.id === message.id);
    if (targetIndex === -1) return;

    const request = message.request;
    const nextMessages = messagesRef.current.map((item, index) =>
      index === targetIndex
        ? {
            ...item,
            content: "",
            status: "pending" as const,
            error: undefined,
          }
        : item,
    );

    activeRequestRef.current = {
      assistantId: message.id,
      request,
    };

    setMessages(nextMessages);
    setTransportMessages(createTransportMessages(nextMessages.slice(0, targetIndex)));

    void sendMessage({
      role: "user",
      messageId:
        nextMessages
          .slice(0, targetIndex)
          .reverse()
          .find((item) => item.role === "user")?.id ?? undefined,
      parts: [
        ...(request.imageUri && request.imageMimeType
          ? [
              {
                type: "file" as const,
                url: request.imageUri,
                mediaType: request.imageMimeType,
              },
            ]
          : []),
        { type: "text" as const, text: request.prompt },
      ],
    });
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
