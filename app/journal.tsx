import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { ui } from "@/lib/theme";

type DiaryEntry = {
  id: string;
  time: string;
  note: string;
};

type DiaryDay = {
  date: string;
  entries: DiaryEntry[];
};

const diaryDays: DiaryDay[] = [
  {
    date: "Apr 21",
    entries: [
      { id: "d1-e1", time: "08:10", note: "Morning walk, sky looked clear." },
      {
        id: "d1-e2",
        time: "13:25",
        note: "Quick coffee before a long meeting.",
      },
      {
        id: "d1-e3",
        time: "22:40",
        note: "Wrote down three things I feel grateful for.",
      },
    ],
  },
  {
    date: "Apr 20",
    entries: [
      { id: "d2-e1", time: "09:05", note: "Started the day with quiet focus." },
      {
        id: "d2-e2",
        time: "18:50",
        note: "Wrapped up tasks and planned tomorrow.",
      },
    ],
  },
  {
    date: "Apr 19",
    entries: [
      { id: "d3-e1", time: "21:30", note: "Read for 20 minutes before sleep." },
    ],
  },
];

export default function JournalScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "My Journal",
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Daily Notes</Text>
          <Text style={styles.subtitle}>
            Short moments captured through the day
          </Text>
        </View>

        {diaryDays.map((day, index) => {
          const isLastDay = index === diaryDays.length - 1;

          return (
            <View key={day.date} style={styles.dayBlock}>
              <Text style={styles.dateLabel}>{day.date}</Text>

              <View
                style={[styles.timelineTrack, isLastDay && styles.trackTail]}
              />

              <View style={styles.cardsCol}>
                {day.entries.map((entry) => (
                  <View key={entry.id} style={styles.entryRow}>
                    <Card style={styles.entryCard}>
                      <Text style={styles.entryTime}>{entry.time}</Text>
                      <Text style={styles.entryNote}>{entry.note}</Text>
                    </Card>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: ui.screen,
  content: ui.content,
  header: ui.header,
  title: ui.title,
  subtitle: ui.subtitle,
  dayBlock: {
    position: "relative",
  },
  dateLabel: {
    marginLeft: 2,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  timelineTrack: {
    position: "absolute",
    left: 6,
    top: 24,
    bottom: -6,
    borderLeftWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  trackTail: {
    bottom: 8,
  },
  cardsCol: {
    gap: 10,
    paddingLeft: 16,
    paddingBottom: 14,
  },
  entryRow: {
    position: "relative",
  },
  entryCard: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  entryTime: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  entryNote: {
    marginTop: 6,
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
});
