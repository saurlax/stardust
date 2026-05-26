import { Stack } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatMonthDay, locale, t } from "@/lib/i18n";

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
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: t("journal.title"),
        }}
      />

      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-2 px-0.5">
          <Text className="text-xl font-semibold">{t("journal.headerTitle")}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">{t("journal.subtitle")}</Text>
        </View>

        {(diaryDaysByLocale[locale] ?? diaryDaysByLocale.en).map(
          (day, index, days) => {
            const isLastDay = index === days.length - 1;

            return (
              <View key={day.date.toISOString()} className="relative">
                <Text className="mb-2 ml-0.5 text-xs font-semibold">
                  {formatMonthDay(day.date)}
                </Text>

                <View
                  className="absolute left-1.5 top-6 border-l border-dashed border-border"
                  style={{ bottom: isLastDay ? 8 : -6 }}
                />

                <View className="gap-2.5 pb-3.5 pl-4">
                  {day.entries.map((entry) => (
                    <Card key={entry.id} className="min-h-[72px] justify-center gap-1 py-4">
                      <CardContent className="gap-1">
                        <CardDescription>{entry.time}</CardDescription>
                        <Text className="text-sm leading-5">{entry.note}</Text>
                      </CardContent>
                    </Card>
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
