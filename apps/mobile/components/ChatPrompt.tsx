import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button, theme } from "@/components/ui";
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

  return (
    <View style={styles.promptWrap}>
      {selectedImageUri ? (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: selectedImageUri }}
            style={styles.previewImage}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.removeSelectedImage")}
            onPress={onClearSelectedImage}
            style={styles.previewRemoveButton}
          >
            <Ionicons name="close" size={14} color={theme.colors.text} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <Pressable
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
          style={styles.iconButton}
        >
          <Ionicons
            name={inputMode === "text" ? "mic" : "keypad"}
            size={22}
            color={theme.colors.text}
          />
        </Pressable>

        {inputMode === "text" ? (
          <View style={styles.textInputWrap}>
            <TextInput
              value={text}
              onChangeText={onChangeText}
              placeholder={
                sending ? t("chat.thinking") : t("chat.messagePlaceholder")
              }
              placeholderTextColor={theme.colors.borderMuted}
              style={[styles.textInput, { height: textInputHeight }]}
              multiline
              numberOfLines={1}
              scrollEnabled={textInputHeight >= TEXT_INPUT_MAX_HEIGHT}
              onContentSizeChange={(event) => {
                syncTextInputHeight(event.nativeEvent.contentSize.height);
              }}
              editable={!sending}
            />

            <Text
              pointerEvents="none"
              onTextLayout={(event) => {
                syncTextInputHeight(
                  event.nativeEvent.lines.length * TEXT_INPUT_LINE_HEIGHT + 20,
                );
              }}
              style={styles.textInputMirror}
            >
              {text || " "}
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.voiceInput")}
            onPress={onSendVoice}
            style={styles.voiceButton}
          >
            <Text style={styles.voiceText}>{t("chat.holdToTalk")}</Text>
          </Pressable>
        )}

        <View style={styles.rightActions}>
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.camera")}
            hitSlop={10}
            onPress={onPressCamera}
            icon="camera"
            rounded
            color="neutral"
          />
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.add")}
            hitSlop={10}
            onPress={onPressAdd}
            icon="add"
            rounded
            color="neutral"
          />
          {inputMode === "text" ? (
            <Button
              accessibilityRole="button"
              accessibilityLabel={t("chat.send")}
              hitSlop={10}
              onPress={onSendText}
              icon="send"
              rounded
              color="neutral"
              disabled={sending || (!text.trim() && !selectedImageUri)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  promptWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  previewWrap: {
    position: "relative",
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.border,
  },
  previewRemoveButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceOverlay,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  textInputWrap: {
    flex: 1,
    position: "relative",
  },
  textInput: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: TEXT_INPUT_LINE_HEIGHT,
    textAlignVertical: "top",
  },
  textInputMirror: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: TEXT_INPUT_LINE_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceButton: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceSoft,
  },
  voiceText: { fontSize: 16, color: theme.colors.text },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
