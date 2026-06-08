import { Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatMonthDay, formatTime, t } from "@/lib/i18n";
import { listJournalDays, type JournalDay } from "@/lib/db";

export default function JournalScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<JournalDay[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      listJournalDays(db)
        .then((nextDays) => {
          if (!active) return;
          setDays(nextDays);
        })
        .catch(() => {
          if (!active) return;
          setDays([]);
        });

      return () => {
        active = false;
      };
    }, [db]),
  );

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

        {!days.length ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{t("journal.empty")}</Text>
          </Card>
        ) : null}

        {days.map((day, index, allDays) => {
          const isLastDay = index === allDays.length - 1;

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
                      <CardDescription>
                        {formatTime(new Date(entry.timestamp))}
                        {entry.source === "memory" ? ` · ${t("journal.memoryEntryPrefix")}` : ""}
                      </CardDescription>
                      <Text className="text-sm leading-5">{entry.note}</Text>
                    </CardContent>
                  </Card>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
