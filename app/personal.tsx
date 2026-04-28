import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { Card } from "@/components/ui/Card";
import { theme, ui } from "@/lib/theme";

const entries = [
  {
    title: "My Journal",
    description: "Review and manage daily summaries",
    route: "/journal" as const,
  },
  {
    title: "My Calendar",
    description: "Review and manage calendar events",
    route: "/calendar" as const,
  },
];

export default function PersonalScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Personal",
        }}
      />

      <View style={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName}>User</Text>
            <Text style={styles.profileSubtitle}>
              Your personal space and story
            </Text>
          </View>
        </View>

        <Card style={styles.personalCard}>
          <NebulaView style={styles.nebulaStage} />
          <View style={styles.personalOverlay}>
            <Text style={styles.personalCardTitle}>Personal Memories</Text>
            <Text style={styles.personalCardDescription}>
              Meet your digital twin in fragments: the traces, contexts, and
              quiet moments that shape who you are
            </Text>
          </View>
        </Card>

        <View style={styles.section}>
          {entries.map((entry) => (
            <Pressable
              key={entry.title}
              accessibilityRole="button"
              onPress={() => {
                router.push(entry.route);
              }}
              style={styles.entryCard}
            >
              <Text style={styles.entryTitle}>{entry.title}</Text>
              <Text style={styles.entryDescription}>{entry.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: ui.screen,
  content: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  avatar: ui.primaryAvatar,
  profileTextWrap: { flex: 1, gap: 3 },
  profileName: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  profileSubtitle: { fontSize: 12, color: theme.colors.textMuted },
  personalCard: {
    position: "relative",
    height: 220,
    overflow: "hidden",
  },
  personalCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  personalCardDescription: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.82)",
  },
  personalOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  nebulaStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.text,
  },
  section: { gap: 12 },
  entryCard: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  entryTitle: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  entryDescription: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});
