import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";

const entries = [
  {
    title: "My Journal",
    description: "Review and manage daily summaries",
    route: "/journal",
  },
  { title: "My Schedule", description: "Review and manage schedule summaries" },
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

        <View style={styles.personalCard}>
          <NebulaView style={styles.nebulaStage} />
          <View style={styles.personalOverlay}>
            <Text style={styles.personalCardTitle}>Personal Memories</Text>
            <Text style={styles.personalCardDescription}>
              Meet your digital twin in fragments: the traces, contexts, and
              quiet moments that shape who you are
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          {entries.map((entry) => (
            <Pressable
              key={entry.title}
              accessibilityRole="button"
              onPress={() => {
                if (entry.route) {
                  router.push(entry.route as "/journal");
                }
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
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  profileTextWrap: { flex: 1, gap: 3 },
  profileName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  profileSubtitle: { fontSize: 12, color: "#6B7280" },
  personalCard: {
    position: "relative",
    height: 220,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
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
    backgroundColor: "#111111",
  },
  section: { gap: 12 },
  entryCard: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    justifyContent: "center",
  },
  entryTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  entryDescription: { marginTop: 4, fontSize: 13, color: "#6B7280" },
});
