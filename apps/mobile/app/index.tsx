import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatMessages } from "@/components/ChatMessages";
import { ChatPrompt } from "@/components/ChatPrompt";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useConfig } from "@/context/config";
import type { ChatMessage, MemoryCandidateStatus } from "@/lib/chat/types";
import { sendChatRequest } from "@/lib/chat/runtime";
import { getConfigValidationError } from "@/lib/config";
import {
  createSessionId,
  findRelevantKnowledge,
  loadLatestChatSession,
  saveChatSessionSnapshot,
  syncDerivedEntitiesForSession,
} from "@/lib/db";
import { t } from "@/lib/i18n";

const DEFAULT_IMAGE_PROMPT = t("chat.defaultImagePrompt");
const GREETING_ID = "m1";

type RequestContext = {
  assistantId: string;
  request: NonNullable<ChatMessage["request"]>;
};

const createGreetingMessage = (): ChatMessage => ({
  id: GREETING_ID,
  role: "assistant",
  content: t("chat.assistantGreeting"),
  status: "done",
});

const buildMemoryContext = (
  memories: { source: "memory" | "journal"; type?: string; content: string; createdAt: string }[],
) =>
  memories
    .map(
      (memory, index) =>
        `${index + 1}. [${
          memory.source === "memory" ? memory.type ?? "memory" : "journal"
        }] ${memory.content} (${memory.createdAt.slice(0, 10)})`,
    )
    .join("\n");

export default function Index() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const { config, ready } = useConfig();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string>();
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([createGreetingMessage()]);
  const [sending, setSending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const chatIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(createSessionId());
  const handledShareRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef(messages);
  const activeRequestRef = useRef<RequestContext | null>(null);
  const configRef = useRef(config);
  const hydratingRef = useRef(true);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    let active = true;

    loadLatestChatSession(db)
      .then((session) => {
        if (!active) return;

        if (session) {
          sessionIdRef.current = session.sessionId;
          chatIdRef.current = session.remoteChatId ?? null;
          setMessages(session.messages.length ? session.messages : [createGreetingMessage()]);
        }
      })
      .finally(() => {
        if (!active) return;
        hydratingRef.current = false;
        setSessionReady(true);
      });

    return () => {
      active = false;
    };
  }, [db]);

  useEffect(() => {
    if (!sessionReady || hydratingRef.current) return;

    const persist = async () => {
      await saveChatSessionSnapshot(db, {
        sessionId: sessionIdRef.current,
        remoteChatId: chatIdRef.current,
        messages,
      });

      await syncDerivedEntitiesForSession(db, sessionIdRef.current, messages);
    };

    void persist().catch((error) => {
      console.error(error);
    });
  }, [db, messages, sessionReady]);

  const replaceMessage = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? updater(message) : message)),
      );
    },
    [],
  );

  const updateAssistantText = useCallback(
    (assistantId: string, content: string, status: ChatMessage["status"]) => {
      replaceMessage(assistantId, (message) => ({
        ...message,
        content,
        status,
        error: undefined,
      }));
    },
    [replaceMessage],
  );

  const createTransportMessages = useCallback(
    () =>
      messagesRef.current.filter((message) => {
        if (message.id === GREETING_ID) return false;
        if (message.status === "error" || message.status === "pending") return false;
        if (message.role === "assistant") {
          return message.status === "done" || message.status === "streaming";
        }

        return true;
      }),
    [],
  );

  const runRequest = useCallback(
    async ({
      assistantId,
      request,
      sourceMessages,
    }: {
      assistantId: string;
      request: NonNullable<ChatMessage["request"]>;
      sourceMessages: ChatMessage[];
    }) => {
      let streamedContent = "";

      try {
        const memoryContext =
          configRef.current.runtimeMode === "local"
            ? buildMemoryContext(await findRelevantKnowledge(db, request.prompt))
            : undefined;

        const result = await sendChatRequest({
          chatId: chatIdRef.current,
          config: configRef.current,
          messages: sourceMessages,
          prompt: request.prompt,
          memoryContext,
          imageUri: request.imageUri,
          imageMimeType: request.imageMimeType,
          onChatId: (chatId) => {
            chatIdRef.current = chatId;
          },
          onTextDelta: (delta) => {
            streamedContent += delta;
            updateAssistantText(assistantId, streamedContent, "streaming");
          },
        });

        if (result.chatId) {
          chatIdRef.current = result.chatId;
        }

        replaceMessage(assistantId, (message) => ({
          ...message,
          content: result.content,
          status: "done",
          error: undefined,
          toolCards: result.toolCards,
        }));
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : t("chat.requestFailed");

        replaceMessage(assistantId, (current) => ({
          ...current,
          status: "error",
          error: message,
        }));
      } finally {
        activeRequestRef.current = null;
        setSending(false);
      }
    },
    [db, replaceMessage, updateAssistantText],
  );

  const sendPrompt = useCallback(
    (prompt: string, imageUri?: string, imageMimeType?: string) => {
      const trimmed = prompt.trim();
      const effectivePrompt = trimmed || (imageUri ? DEFAULT_IMAGE_PROMPT : "");
      if (!effectivePrompt || sending || !ready) return;

      const validationKey = getConfigValidationError(configRef.current);
      if (validationKey) {
        Alert.alert(t("settings.title"), t(validationKey));
        return;
      }

      const request: NonNullable<ChatMessage["request"]> = {
        prompt: effectivePrompt,
        imageUri,
        imageMimeType,
      };
      const timestamp = Date.now();
      const userMessage: ChatMessage = {
        id: `user-${timestamp}`,
        role: "user",
        content: effectivePrompt,
        status: "done",
        createdAt: new Date(timestamp).toISOString(),
        imageUri,
        imageMimeType,
      };
      const assistantMessage: ChatMessage = {
        id: `assistant-${timestamp}`,
        role: "assistant",
        content: "",
        status: "pending",
        createdAt: new Date(timestamp).toISOString(),
        request,
      };
      const sourceMessages = [...createTransportMessages(), userMessage];

      activeRequestRef.current = {
        assistantId: assistantMessage.id,
        request,
      };
      setSending(true);
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setText("");
      setSelectedImageUri(undefined);
      setSelectedImageMimeType(undefined);

      void runRequest({
        assistantId: assistantMessage.id,
        request,
        sourceMessages,
      });
    },
    [createTransportMessages, ready, runRequest, sending],
  );

  const sendText = () => sendPrompt(text, selectedImageUri, selectedImageMimeType);
  const sendVoicePlaceholder = () => sendPrompt(t("chat.voiceMessage"));

  const retryMessage = (message: ChatMessage) => {
    if (!message.request?.prompt || sending) return;

    const targetIndex = messagesRef.current.findIndex((item) => item.id === message.id);
    if (targetIndex === -1) return;

    const validationKey = getConfigValidationError(configRef.current);
    if (validationKey) {
      Alert.alert(t("settings.title"), t(validationKey));
      return;
    }

    const request = message.request;
    const nextMessages = messagesRef.current.map((item, index) =>
      index === targetIndex
        ? {
            ...item,
            content: "",
            status: "retrying" as const,
            error: undefined,
            toolCards: undefined,
          }
        : item,
    );
    const sourceMessages = nextMessages
      .slice(0, targetIndex)
      .filter((item) => item.id !== GREETING_ID && item.status !== "error" && item.status !== "pending");

    activeRequestRef.current = {
      assistantId: message.id,
      request,
    };
    setSending(true);
    setMessages(nextMessages);

    void runRequest({
      assistantId: message.id,
      request,
      sourceMessages,
    });
  };

  const updateToolCardStatus = (
    messageId: string,
    cardId: string,
    status: MemoryCandidateStatus,
    nextContent?: string,
  ) => {
    replaceMessage(messageId, (message) => ({
      ...message,
      toolCards: message.toolCards?.map((card) =>
        card.id === cardId
          ? {
              ...card,
              status,
              payload: {
                ...card.payload,
                content: nextContent ?? card.payload.content,
              },
            }
          : card,
      ),
    }));
  };

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("settings.title"), t("chat.cameraPermissionRequired"));
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
      Alert.alert(t("settings.title"), t("chat.cameraOpenFailed"));
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
      Alert.alert(t("settings.title"), t("chat.libraryOpenFailed"));
    }
  };

  useEffect(() => {
    if (!sessionReady || !hasShareIntent || !shareIntent || sending || !ready) return;
    const signature = JSON.stringify(shareIntent);
    if (handledShareRef.current === signature) return;
    handledShareRef.current = signature;

    const sharedImage = shareIntent.files?.find((file) => file.mimeType.startsWith("image/"));
    if (sharedImage?.path) {
      setSelectedImageUri(sharedImage.path);
      setSelectedImageMimeType(sharedImage.mimeType || "image/jpeg");
    }
    if (shareIntent.text || shareIntent.webUrl) {
      setText(shareIntent.text || shareIntent.webUrl || "");
    }
    resetShareIntent();
  }, [hasShareIntent, ready, resetShareIntent, sending, sessionReady, shareIntent]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("chat.title"),
          headerTitleAlign: "center",
          headerTitle: () => (
            <View className="items-center justify-center">
              <Text className="text-center text-[22px] font-bold">{t("chat.title")}</Text>
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
          onUpdateCandidateStatus={updateToolCardStatus}
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
