import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { formatMonthDay, locale, t } from "@/lib/i18n";
import { ui } from "@/lib/theme";

type DiaryEntry = {
  id: string;
  time: string;
  note: string;
};

type DiaryDay = {
  date: Date;
  entries: DiaryEntry[];
};

const diaryDaysByLocale: Record<string, DiaryDay[]> = {
  en: [
    {
      date: new Date(2026, 3, 21),
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
      date: new Date(2026, 3, 20),
      entries: [
        {
          id: "d2-e1",
          time: "09:05",
          note: "Started the day with quiet focus.",
        },
        {
          id: "d2-e2",
          time: "18:50",
          note: "Wrapped up tasks and planned tomorrow.",
        },
      ],
    },
    {
      date: new Date(2026, 3, 19),
      entries: [
        {
          id: "d3-e1",
          time: "21:30",
          note: "Read for 20 minutes before sleep.",
        },
      ],
    },
  ],
  "zh-Hans": [
    {
      date: new Date(2026, 3, 21),
      entries: [
        { id: "d1-e1", time: "08:10", note: "晨间散步，天空很晴朗。" },
        { id: "d1-e2", time: "13:25", note: "长会前快速喝了杯咖啡。" },
        { id: "d1-e3", time: "22:40", note: "写下了三件让我感激的事。" },
      ],
    },
    {
      date: new Date(2026, 3, 20),
      entries: [
        { id: "d2-e1", time: "09:05", note: "以安静专注开启了这一天。" },
        { id: "d2-e2", time: "18:50", note: "收尾任务，并规划了明天。" },
      ],
    },
    {
      date: new Date(2026, 3, 19),
      entries: [{ id: "d3-e1", time: "21:30", note: "睡前读了 20 分钟。" }],
    },
  ],
};

export default function JournalScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("journal.title"),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("journal.headerTitle")}</Text>
          <Text style={styles.subtitle}>{t("journal.subtitle")}</Text>
        </View>

        {(diaryDaysByLocale[locale] ?? diaryDaysByLocale.en).map(
          (day, index, days) => {
            const isLastDay = index === days.length - 1;

            return (
              <View key={day.date.toISOString()} style={styles.dayBlock}>
                <Text style={styles.dateLabel}>{formatMonthDay(day.date)}</Text>

                <View
                  style={[styles.timelineTrack, isLastDay && styles.trackTail]}
                />

                <View style={styles.cardsCol}>
                  {day.entries.map((entry) => (
                    <View key={entry.id} style={styles.entryRow}>
                      <Card
                        style={styles.entryCard}
                        description={entry.time}
                        descriptionStyle={styles.entryTime}
                      >
                        <Text style={styles.entryNote}>{entry.note}</Text>
                      </Card>
                    </View>
                  ))}
                </View>
              </View>
            );
          },
        )}
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
    justifyContent: "center",
  },
  entryTime: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  entryNote: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
});
