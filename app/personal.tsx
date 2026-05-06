import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NebulaView } from "@/components/NebulaView";
import { Card } from "@/components/ui/Card";
import { t } from "@/lib/i18n";
import { theme, ui } from "@/lib/theme";

export default function PersonalScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("personal.title"),
        }}
      />

      <View style={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName}>{t("personal.profileName")}</Text>
            <Text style={styles.profileSubtitle}>
              {t("personal.profileSubtitle")}
            </Text>
          </View>
        </View>

        <View style={styles.cardsContainer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/memory")}
            style={[styles.entryCard, styles.memoryEntryCard]}
          >
            <Card
              style={styles.personalCard}
              background={<NebulaView style={styles.nebulaStage} />}
              title={t("personal.memoryTitle")}
              description={t("personal.memoryDescription")}
              overlayStyle={styles.personalOverlay}
              titleStyle={styles.personalCardTitle}
              descriptionStyle={styles.personalCardDescription}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/journal")}
            style={styles.tapCard}
          >
            <Card
              style={styles.entryCard}
              title={t("personal.journalTitle")}
              description={t("personal.journalDescription")}
              overlayStyle={styles.entryOverlay}
              titleStyle={styles.entryTitle}
              descriptionStyle={styles.entryDescription}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/calendar")}
            style={styles.tapCard}
          >
            <Card
              style={styles.entryCard}
              title={t("personal.calendarTitle")}
              description={t("personal.calendarDescription")}
              overlayStyle={styles.entryOverlay}
              titleStyle={styles.entryTitle}
              descriptionStyle={styles.entryDescription}
            />
          </Pressable>
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.avatar,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.text,
  },
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
  cardsContainer: { gap: 12 },
  tapCard: {
    borderRadius: theme.radii.card,
  },
  entryCard: {
    minHeight: 72,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  entryOverlay: {
    justifyContent: "center",
  },
  memoryEntryCard: {
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
  },
  entryTitle: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  entryDescription: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});
