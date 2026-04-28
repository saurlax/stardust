import * as Calendar from "expo-calendar";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { theme, ui } from "@/lib/theme";

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
const APP_CALENDAR_COLOR = "#111827";

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const normalizeEvents = (events: Calendar.Event[]): CalendarEvent[] =>
  events
    .map<CalendarEvent | null>((event) => {
      if (!event.startDate || !event.endDate) return null;
      const normalized: CalendarEvent = {
        id: event.id,
        title: event.title || "Untitled event",
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
      label: formatDayLabel(event.startDate),
      events: [event],
    });
  }

  return [...map.values()].sort((a, b) =>
    a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0,
  );
};

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
      setError("Calendar permission is required to read events.");
      return;
    }

    const calendarId = await ensureAppCalendarId();

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59);

    const events = await Calendar.getEventsAsync([calendarId], from, to);
    const groupedDays = groupEventsByDay(normalizeEvents(events));
    setDays(groupedDays);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCalendarEvents();
    } catch {
      setError("Failed to load events from calendar.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadCalendarEvents]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "My Calendar",
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Calendar Events</Text>
          <Text style={styles.subtitle}>
            Events created in your Stardust calendar
          </Text>
        </View>

        {loading ? (
          <Card style={styles.stateBox}>
            <ActivityIndicator color="#111827" />
            <Text style={styles.stateText}>Loading events...</Text>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {!loading && !error && !days.length ? (
          <Card style={styles.stateBox}>
            <Text style={styles.stateText}>No events found for this app.</Text>
          </Card>
        ) : null}

        {!loading && !error
          ? days.map((day, index) => {
              const isLastDay = index === days.length - 1;

              return (
                <View key={day.dateKey} style={styles.dayBlock}>
                  <Text style={styles.dateLabel}>{day.label}</Text>

                  <View
                    style={[
                      styles.timelineTrack,
                      isLastDay && styles.trackTail,
                    ]}
                  />

                  <View style={styles.cardsCol}>
                    {day.events.map((event) => (
                      <Card key={event.id} style={styles.entryCard}>
                        <Text style={styles.entryTime}>
                          {formatTime(event.startDate)} -{" "}
                          {formatTime(event.endDate)}
                        </Text>
                        <Text style={styles.entryTitle}>{event.title}</Text>
                        {event.location ? (
                          <Text style={styles.entryMeta}>{event.location}</Text>
                        ) : null}
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

const styles = StyleSheet.create({
  screen: ui.screen,
  content: ui.content,
  header: {
    ...ui.header,
    marginBottom: 4,
  },
  title: ui.title,
  subtitle: ui.subtitle,
  stateBox: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  stateText: ui.mutedText,
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    textAlign: "center",
  },
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
  entryCard: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  entryTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  entryTitle: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    fontWeight: "600",
  },
  entryMeta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
});
