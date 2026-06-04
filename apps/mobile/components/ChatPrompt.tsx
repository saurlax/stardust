import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, type NativeSyntheticEvent, TextInputKeyPressEventData, useColorScheme, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/lib/i18n";

const TEXT_INPUT_MIN_HEIGHT = 40;
const TEXT_INPUT_MAX_HEIGHT = 120;
const TEXT_INPUT_LINE_HEIGHT = 20;

type ChatPromptProps = {
  inputMode: "text" | "voice";
  text: string;
  sending: boolean;
  selectedImageUri?: string;
  onChangeText: (value: string) => void;
  onInputModeChange: (nextMode: "text" | "voice") => void;
  onSendText: () => void;
  onSendVoice: () => void;
  onClearSelectedImage: () => void;
  onPressCamera: () => void;
  onPressAdd: () => void;
};

export function ChatPrompt({
  inputMode,
  text,
  sending,
  selectedImageUri,
  onChangeText,
  onInputModeChange,
  onSendText,
  onSendVoice,
  onClearSelectedImage,
  onPressCamera,
  onPressAdd,
}: ChatPromptProps) {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const [textInputHeight, setTextInputHeight] = useState(TEXT_INPUT_MIN_HEIGHT);

  const syncTextInputHeight = (nextHeight: number) => {
    setTextInputHeight(
      Math.max(
        TEXT_INPUT_MIN_HEIGHT,
        Math.min(TEXT_INPUT_MAX_HEIGHT, nextHeight),
      ),
    );
  };

  useEffect(() => {
    const lineCount = text.split("\n").length;
    syncTextInputHeight(lineCount * TEXT_INPUT_LINE_HEIGHT + 20);
  }, [text]);

  const handleTextKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (
      event.nativeEvent.key === "Enter" &&
      "ctrlKey" in event.nativeEvent &&
      event.nativeEvent.ctrlKey
    ) {
      event.preventDefault?.();
      onSendText();
    }
  };

  return (
    <View className="gap-2 border-t border-border px-2.5 pb-2 pt-2">
      {selectedImageUri ? (
        <View className="relative h-24 w-24 overflow-hidden rounded-md">
          <Image source={{ uri: selectedImageUri }} className="h-full w-full bg-muted" />
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.removeSelectedImage")}
            onPress={onClearSelectedImage}
            variant="secondary"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 rounded-full"
          >
            <Ionicons name="close" size={14} color={iconColor} />
          </Button>
        </View>
      ) : null}

      <View className="flex-row items-center gap-2">
        <Button
          accessibilityRole="button"
          accessibilityLabel={
            inputMode === "text"
              ? t("chat.switchToVoiceInput")
              : t("chat.switchToTyping")
          }
          hitSlop={10}
          onPress={() =>
            onInputModeChange(inputMode === "text" ? "voice" : "text")
          }
          variant="ghost"
          size="icon"
          className="rounded-full"
        >
          <Ionicons
            name={inputMode === "text" ? "mic" : "keypad"}
            size={22}
            color={iconColor}
          />
        </Button>

        {inputMode === "text" ? (
          <Textarea
            value={text}
            onChangeText={onChangeText}
            placeholder={sending ? t("chat.thinking") : t("chat.messagePlaceholder")}
            className="min-h-10 flex-1 rounded-md bg-muted px-3 py-2"
            style={{ height: textInputHeight, lineHeight: TEXT_INPUT_LINE_HEIGHT }}
            multiline
            numberOfLines={1}
            scrollEnabled={textInputHeight >= TEXT_INPUT_MAX_HEIGHT}
            onKeyPress={handleTextKeyPress}
            onContentSizeChange={(event) => {
              syncTextInputHeight(event.nativeEvent.contentSize.height);
            }}
            editable={!sending}
          />
        ) : (
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.voiceInput")}
            onPress={onSendVoice}
            variant="outline"
            className="min-h-10 flex-1 rounded-full"
          >
            <Text>{t("chat.holdToTalk")}</Text>
          </Button>
        )}

        <View className="flex-row items-center gap-1.5">
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.camera")}
            hitSlop={10}
            onPress={onPressCamera}
            variant="ghost"
            size="icon"
            className="rounded-full"
          >
            <Ionicons name="camera" size={22} color={iconColor} />
          </Button>
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.add")}
            hitSlop={10}
            onPress={onPressAdd}
            variant="ghost"
            size="icon"
            className="rounded-full"
          >
            <Ionicons name="add" size={22} color={iconColor} />
          </Button>
          {inputMode === "text" ? (
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("chat.send")}
              hitSlop={10}
              onPress={onSendText}
              size="icon"
              className="rounded-full"
              disabled={sending || (!text.trim() && !selectedImageUri)}
            >
              <Ionicons name="send" size={18} color={colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA"} />
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}
