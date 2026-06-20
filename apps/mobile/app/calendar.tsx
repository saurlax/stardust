import * as Calendar from "expo-calendar";
import { router, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { createEpisode } from "@/lib/db";
import { formatMonthDay, formatTime, t } from "@/lib/i18n";

type CalendarEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
};

type CalendarDay = {
  dateKey: string;
  label: string;
  events: CalendarEvent[];
};

const APP_CALENDAR_TITLE = "Stardust";
const APP_CALENDAR_NAME = "stardust-internal";
const APP_CALENDAR_COLOR = "#0A0A0A";

const normalizeEvents = (events: Calendar.Event[]): CalendarEvent[] =>
  events
    .map<CalendarEvent | null>((event) => {
      if (!event.startDate || !event.endDate) return null;
      const normalized: CalendarEvent = {
        id: event.id,
        title: event.title || t("calendar.untitledEvent"),
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
      };

      if (event.location) {
        normalized.location = event.location;
      }

      return normalized;
    })
    .filter((event): event is CalendarEvent => event !== null)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

const groupEventsByDay = (events: CalendarEvent[]): CalendarDay[] => {
  const map = new Map<string, CalendarDay>();

  for (const event of events) {
    const dateKey = event.startDate.toISOString().slice(0, 10);
    const existing = map.get(dateKey);
    if (existing) {
      existing.events.push(event);
      continue;
    }

    map.set(dateKey, {
      dateKey,
      label: formatMonthDay(event.startDate),
      events: [event],
    });
  }

  return [...map.values()].sort((a, b) =>
    a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0,
  );
};

const buildCalendarEpisodeContent = (event: CalendarEvent) =>
  [
    event.title,
    `${formatMonthDay(event.startDate)} ${formatTime(event.startDate)} - ${formatTime(event.endDate)}`,
    event.location ? `${t("calendar.location")}: ${event.location}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

const getAppCalendarIds = async () => {
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  return calendars
    .filter(
      (calendar) =>
        calendar.title === APP_CALENDAR_TITLE ||
        calendar.name === APP_CALENDAR_NAME,
    )
    .map((calendar) => calendar.id);
};

const ensureAppCalendarId = async () => {
  const existingIds = await getAppCalendarIds();
  if (existingIds.length) return existingIds[0];

  if (Platform.OS === "ios") {
    const source = (await Calendar.getDefaultCalendarAsync()).source;
    return Calendar.createCalendarAsync({
      title: APP_CALENDAR_TITLE,
      name: APP_CALENDAR_NAME,
      color: APP_CALENDAR_COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: source.id,
      source,
      ownerAccount: "personal",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  const source: Calendar.Source = {
    type: Calendar.SourceType.LOCAL,
    name: APP_CALENDAR_NAME,
    isLocalAccount: true,
  };

  return Calendar.createCalendarAsync({
    title: APP_CALENDAR_TITLE,
    name: APP_CALENDAR_NAME,
    color: APP_CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    source,
    ownerAccount: "personal",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
};

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const indicatorColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<CalendarDay[]>([]);

  const loadCalendarEvents = useCallback(async () => {
    setError(null);

    const permission = await Calendar.getCalendarPermissionsAsync();
    const granted = permission.granted
      ? permission
      : await Calendar.requestCalendarPermissionsAsync();

    if (!granted.granted) {
      setDays([]);
      setError(t("calendar.permissionRequired"));
      return;
    }

    const calendarId = await ensureAppCalendarId();

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59);

    const events = await Calendar.getEventsAsync([calendarId], from, to);
    const normalizedEvents = normalizeEvents(events);
    await Promise.all(
      normalizedEvents.map((event) =>
        createEpisode(db, {
          id: `episode-calendar-${event.id}`,
          source: "calendar",
          title: event.title,
          content: buildCalendarEpisodeContent(event),
          metadata: {
            calendarEventId: event.id,
            location: event.location,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate.toISOString(),
          },
          createdAt: event.startDate.toISOString(),
        }),
      ),
    );
    const groupedDays = groupEventsByDay(normalizedEvents);
    setDays(groupedDays);
  }, [db]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCalendarEvents();
    } catch {
      setError(t("calendar.loadFailed"));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadCalendarEvents]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Drawer.Screen
        options={{
          title: t("calendar.title"),
        }}
      />

      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View className="mb-1 px-0.5">
          <Text className="text-xl font-semibold">{t("calendar.headerTitle")}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">{t("calendar.subtitle")}</Text>
        </View>

        {loading ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <ActivityIndicator color={indicatorColor} />
            <Text variant="muted">{t("calendar.loading")}</Text>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text className="text-center text-sm text-destructive">{error}</Text>
          </Card>
        ) : null}

        {!loading && !error && !days.length ? (
          <Card className="min-h-24 items-center justify-center px-4">
            <Text variant="muted">{t("calendar.noEvents")}</Text>
          </Card>
        ) : null}

        {!loading && !error
          ? days.map((day, index) => {
              const isLastDay = index === days.length - 1;

              return (
                <View key={day.dateKey} className="relative">
                  <Text className="mb-2 ml-0.5 text-xs font-semibold">{day.label}</Text>

                  <View
                    className="absolute left-1.5 top-6 border-l border-dashed border-border"
                    style={{ bottom: isLastDay ? 8 : -6 }}
                  />

                  <View className="gap-2.5 pb-3.5 pl-4">
                    {day.events.map((event) => (
                      <Card key={event.id} className="min-h-[72px] justify-center py-4">
                        <CardContent className="gap-1">
                          <Text variant="muted">
                            {formatTime(event.startDate)} - {formatTime(event.endDate)}
                          </Text>
                          <Text className="text-sm font-semibold leading-5">{event.title}</Text>
                          {event.location ? (
                            <Text variant="muted">{event.location}</Text>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 self-start"
                            onPress={() =>
                              router.push({
                                pathname: "/journal",
                                params: { episodeId: `episode-calendar-${event.id}` },
                              } as Href)
                            }
                          >
                            <Text>{t("calendar.openTimeline")}</Text>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </View>
                </View>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}
