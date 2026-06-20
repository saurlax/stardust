import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
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
import type { ChatMessage, MemoryCandidateStatus } from "@/lib/chat/types";
import { sendChatRequest } from "@/lib/chat/runtime";
import { getConfigValidationError } from "@/lib/config";
import {
  createCandidatesFromToolCards,
  createEpisode,
  createSessionId,
  findRelevantKnowledge,
  getPersonalSnapshot,
  loadLatestChatSession,
  saveChatSessionSnapshot,
  updateCandidateStatus,
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
  memories: {
    source: "memory" | "episode" | "reflection" | "entity";
    type?: string;
    content: string;
    createdAt: string;
  }[],
) => {
  const sections = [
    {
      title: "Saved memories",
      items: memories.filter((memory) => memory.source === "memory"),
    },
    {
      title: "Recent episodes",
      items: memories.filter((memory) => memory.source === "episode"),
    },
    {
      title: "Reflections",
      items: memories.filter((memory) => memory.source === "reflection"),
    },
    {
      title: "Relationship graph",
      items: memories.filter((memory) => memory.source === "entity"),
    },
  ];

  return sections
    .filter((section) => section.items.length)
    .map(
      (section) =>
        `${section.title}:\n${section.items
          .map(
            (memory, index) =>
              `${index + 1}. [${memory.type ?? memory.source}] ${memory.content} (${memory.createdAt.slice(0, 10)})`,
          )
          .join("\n")}`,
    )
    .join("\n\n");
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return t("chat.actionFailed");
};

export default function Index() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const { config, ready } = useConfig();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string>();
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([createGreetingMessage()]);
  const [pendingCandidates, setPendingCandidates] = useState(0);
  const [sending, setSending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
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
          setChatError(null);
          sessionIdRef.current = session.sessionId;
          chatIdRef.current = session.remoteChatId ?? null;
          setMessages(session.messages.length ? session.messages : [createGreetingMessage()]);
        }
      })
      .catch((error) => {
        if (active) setChatError(getErrorMessage(error));
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

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!sessionReady || hydratingRef.current || sending) {
        return () => {
          active = false;
        };
      }

      loadLatestChatSession(db)
        .then((session) => {
          if (!active || !session) return;
          setChatError(null);
          sessionIdRef.current = session.sessionId;
          chatIdRef.current = session.remoteChatId ?? null;
          setMessages(session.messages.length ? session.messages : [createGreetingMessage()]);
        })
        .catch((error) => {
          if (active) setChatError(getErrorMessage(error));
        });

      return () => {
        active = false;
      };
    }, [db, sending, sessionReady]),
  );

  useEffect(() => {
    if (!sessionReady || hydratingRef.current) return;

    const persist = async () => {
      await saveChatSessionSnapshot(db, {
        sessionId: sessionIdRef.current,
        remoteChatId: chatIdRef.current,
        messages,
      });

    };

    void persist().catch((error) => {
      setChatError(getErrorMessage(error));
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

  const refreshPendingCandidates = useCallback(() => {
    void getPersonalSnapshot(db)
      .then((snapshot) => setPendingCandidates(snapshot.pendingCards))
      .catch(() => setPendingCandidates(0));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refreshPendingCandidates();
    }, [refreshPendingCandidates]),
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
        const relevantKnowledge = await findRelevantKnowledge(db, request.prompt);
        setChatError(null);
        const memoryContext = buildMemoryContext(relevantKnowledge);

        replaceMessage(assistantId, (message) => ({
          ...message,
          memoryContextCount: relevantKnowledge.length,
          memoryContext: relevantKnowledge.slice(0, 5),
        }));

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

        const nextAssistantMessage: ChatMessage = {
          ...(messagesRef.current.find((message) => message.id === assistantId) ?? {
            id: assistantId,
            role: "assistant",
            content: "",
            status: "pending",
          }),
          content: result.content,
          status: "done",
          error: undefined,
          memoryContextCount: relevantKnowledge.length,
          memoryContext: relevantKnowledge.slice(0, 5),
        };

        let savedToolCards = result.toolCards;
        try {
          await createCandidatesFromToolCards(db, {
            sessionId: sessionIdRef.current,
            messageId: assistantId,
            episodeId: request.episodeId,
            cards: result.toolCards,
          });
          setChatError(null);
        } catch (error) {
          savedToolCards = [];
          setChatError(getErrorMessage(error));
        }
        refreshPendingCandidates();

        replaceMessage(assistantId, (message) => ({
          ...message,
          ...nextAssistantMessage,
          toolCards: savedToolCards,
        }));
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : t("chat.requestFailed");
        setChatError(message);

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
    [db, refreshPendingCandidates, replaceMessage, updateAssistantText],
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

      const timestamp = Date.now();
      const createdAt = new Date(timestamp).toISOString();
      const episodeId = `episode-user-${timestamp}`;

      const request: NonNullable<ChatMessage["request"]> = {
        prompt: effectivePrompt,
        imageUri,
        imageMimeType,
        episodeId,
      };
      const userMessage: ChatMessage = {
        id: `user-${timestamp}`,
        role: "user",
        content: effectivePrompt,
        status: "done",
        createdAt,
        imageUri,
        imageMimeType,
      };
      const assistantMessage: ChatMessage = {
        id: `assistant-${timestamp}`,
        role: "assistant",
        content: "",
        status: "pending",
        createdAt,
        request,
      };
      const sourceMessages = [...createTransportMessages(), userMessage];
      const nextMessages = [...messagesRef.current, userMessage, assistantMessage];

      activeRequestRef.current = {
        assistantId: assistantMessage.id,
        request,
      };
      setSending(true);
      setMessages(nextMessages);
      setText("");
      setSelectedImageUri(undefined);
      setSelectedImageMimeType(undefined);

      void (async () => {
        try {
          await createEpisode(db, {
            id: episodeId,
            source: imageUri ? "image" : "chat",
            title: imageUri ? t("chat.imageEpisodeTitle") : t("chat.chatEpisodeTitle"),
            content: effectivePrompt,
            mediaUri: imageUri,
            metadata: { sessionId: sessionIdRef.current },
            createdAt,
          });
          await saveChatSessionSnapshot(db, {
            sessionId: sessionIdRef.current,
            remoteChatId: chatIdRef.current,
            messages: nextMessages,
          });
          setChatError(null);
          await runRequest({
            assistantId: assistantMessage.id,
            request,
            sourceMessages,
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message ? error.message : t("chat.requestFailed");
          setChatError(message);
          replaceMessage(assistantMessage.id, (current) => ({
            ...current,
            status: "error",
            error: message,
          }));
          activeRequestRef.current = null;
          setSending(false);
        }
      })();
    },
    [createTransportMessages, db, ready, replaceMessage, runRequest, sending],
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
    void updateCandidateStatus(db, cardId, status, nextContent)
      .then(() => {
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
        setChatError(null);
        refreshPendingCandidates();
      })
      .catch((error) => {
        setChatError(getErrorMessage(error));
      });
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
      void createEpisode(db, {
        source: "image",
        title: t("chat.sharedImageEpisodeTitle"),
        content: shareIntent.text || shareIntent.webUrl || t("chat.sharedImageEpisodeTitle"),
        mediaUri: sharedImage.path,
        metadata: {
          sessionId: sessionIdRef.current,
          shareIntent: true,
          mimeType: sharedImage.mimeType,
        },
      }).catch((error) => setChatError(getErrorMessage(error)));
    }
    if (shareIntent.text || shareIntent.webUrl) {
      const sharedText = shareIntent.text || shareIntent.webUrl || "";
      setText(sharedText);
      void createEpisode(db, {
        source: "share",
        title: t("chat.sharedTextEpisodeTitle"),
        content: sharedText,
        metadata: {
          sessionId: sessionIdRef.current,
          shareIntent: true,
        },
      }).catch((error) => setChatError(getErrorMessage(error)));
    }
    resetShareIntent();
  }, [db, hasShareIntent, ready, resetShareIntent, sending, sessionReady, shareIntent]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <View className="relative h-[72px] justify-center border-b border-border bg-background/80 px-24">
        <View className="absolute bottom-0 left-3 top-0 justify-center">
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.openPersonalPage")}
            hitSlop={10}
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            variant="ghost"
            size="icon"
            className="rounded-full"
          >
            <Ionicons name="menu" size={22} color={iconColor} />
          </Button>
        </View>

        <View className="items-center justify-center">
          <Text className="text-center text-[22px] font-bold">{t("chat.title")}</Text>
          <Text className="mt-0.5 text-center text-xs text-muted-foreground">
            {ready ? t("chat.providerReady") : t("chat.providerLoading")}
          </Text>
        </View>

        <View className="absolute bottom-0 right-3 top-0 flex-row items-center justify-center gap-1">
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.openMemoryInbox")}
            hitSlop={10}
            onPress={() => router.push("/inbox" as Href)}
            variant="ghost"
            size="icon"
            className="relative rounded-full"
          >
            <Ionicons name="file-tray-full-outline" size={21} color={iconColor} />
            {pendingCandidates ? (
              <View className="absolute right-1 top-1 min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
                <Text className="text-[10px] font-semibold leading-4 text-primary-foreground">
                  {pendingCandidates > 9 ? "9+" : pendingCandidates}
                </Text>
              </View>
            ) : null}
          </Button>
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
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {chatError ? (
          <View className="mx-4 mt-3 gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
            <View className="flex-row items-start gap-2">
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text className="flex-1 text-sm text-destructive">{chatError}</Text>
              <Button variant="ghost" size="sm" onPress={() => setChatError(null)}>
                <Ionicons name="close-outline" size={16} color={iconColor} />
              </Button>
            </View>
          </View>
        ) : null}

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
