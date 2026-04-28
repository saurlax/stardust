import { Ionicons } from "@expo/vector-icons";
import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { IconButton } from "@/components/ui/IconButton";
import { theme } from "@/lib/theme";

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
            accessibilityLabel="Remove selected image"
            onPress={onClearSelectedImage}
            style={styles.previewRemoveButton}
          >
            <Ionicons name="close" size={14} color="#111827" />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            inputMode === "text" ? "Switch to voice input" : "Switch to typing"
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
            color="#111827"
          />
        </Pressable>

        {inputMode === "text" ? (
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder={sending ? "Thinking..." : "Message"}
            placeholderTextColor="#9CA3AF"
            style={styles.textInput}
            returnKeyType="send"
            onSubmitEditing={onSendText}
            blurOnSubmit={false}
            editable={!sending}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice input"
            onPress={onSendVoice}
            style={styles.voiceButton}
          >
            <Text style={styles.voiceText}>Hold to talk</Text>
          </Pressable>
        )}

        <View style={styles.rightActions}>
          <IconButton
            accessibilityRole="button"
            accessibilityLabel="Camera"
            hitSlop={10}
            onPress={onPressCamera}
          >
            <Ionicons name="camera" size={22} color="#111827" />
          </IconButton>
          <IconButton
            accessibilityRole="button"
            accessibilityLabel="Add"
            hitSlop={10}
            onPress={onPressAdd}
          >
            <Ionicons name="add" size={26} color="#111827" />
          </IconButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  promptWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
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
    backgroundColor: "#E5E7EB",
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
    backgroundColor: "#FFFFFFE6",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.text,
    fontSize: 16,
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
