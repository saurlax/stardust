import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type ChatPromptProps = {
  inputMode: "text" | "voice";
  text: string;
  sending: boolean;
  onChangeText: (value: string) => void;
  onInputModeChange: (nextMode: "text" | "voice") => void;
  onSendText: () => void;
  onSendVoice: () => void;
  onPressCamera: () => void;
  onPressAdd: () => void;
};

export function ChatPrompt({
  inputMode,
  text,
  sending,
  onChangeText,
  onInputModeChange,
  onSendText,
  onSendVoice,
  onPressCamera,
  onPressAdd,
}: ChatPromptProps) {
  return (
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Camera"
          hitSlop={10}
          style={styles.iconButton}
          onPress={onPressCamera}
        >
          <Ionicons name="camera" size={22} color="#111827" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add"
          hitSlop={10}
          style={[styles.iconButton, styles.rightButton]}
          onPress={onPressAdd}
        >
          <Ionicons name="add" size={26} color="#111827" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
