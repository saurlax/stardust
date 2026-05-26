import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  ActivityIndicator,
  FlatList,
  Image,
  useColorScheme,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { ChatMessage } from "@/lib/chat/types";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
                    {item.imageUri ? (
                      <Image
                        source={{ uri: item.imageUri }}
                        className="mt-2 h-[200px] w-[200px] rounded-md bg-muted"
                      />
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
                        size="icon"
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
                        size="icon"
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
