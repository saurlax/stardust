import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export default function Index() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "m1", role: "assistant", text: "Hi! How can I help?" },
  ]);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    addMessage({ id: `${Date.now()}-u`, role: "user", text: trimmed });
    setText("");

    setTimeout(() => {
      addMessage({
        id: `${Date.now()}-a`,
        role: "assistant",
        text: "Got it.",
      });
    }, 350);
  };

  const sendVoicePlaceholder = () => {
    addMessage({
      id: `${Date.now()}-u`,
      role: "user",
      text: "Voice message",
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View
                style={[
                  styles.messageRow,
                  isUser ? styles.rowRight : styles.rowLeft,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isUser ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  <Text style={[styles.bubbleText, isUser && styles.userText]}>
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.inputBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              inputMode === "text"
                ? "Switch to voice input"
                : "Switch to typing"
            }
            hitSlop={10}
            onPress={() => {
              setInputMode((m) => {
                const next = m === "text" ? "voice" : "text";
                if (next === "text")
                  setTimeout(() => inputRef.current?.focus(), 50);
                return next;
              });
            }}
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
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Message"
              placeholderTextColor="#9CA3AF"
              style={styles.textInput}
              returnKeyType="send"
              onSubmitEditing={sendText}
              blurOnSubmit={false}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voice input"
              onPress={sendVoicePlaceholder}
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
              onPress={() => {}}
            >
              <Ionicons name="camera" size={22} color="#111827" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add"
              hitSlop={10}
              style={[styles.iconButton, styles.rightButton]}
              onPress={() => {}}
            >
              <Ionicons name="add" size={26} color="#111827" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  listContent: { paddingHorizontal: 14, paddingVertical: 10 },
  messageRow: { flexDirection: "row", marginBottom: 10 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleAssistant: { backgroundColor: "#F3F4F6" },
  bubbleUser: { backgroundColor: "#2563EB" },
  bubbleText: { fontSize: 16, lineHeight: 20, color: "#111827" },
  userText: { color: "#FFFFFF" },
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
