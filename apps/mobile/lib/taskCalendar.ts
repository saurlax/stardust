import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

const APP_CALENDAR_TITLE = "Stardust";
const APP_CALENDAR_NAME = "stardust-internal";
const APP_CALENDAR_COLOR = "#0A0A0A";

const getAppCalendarIds = async () => {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((calendar) => calendar.title === APP_CALENDAR_TITLE || calendar.name === APP_CALENDAR_NAME)
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

  return Calendar.createCalendarAsync({
    title: APP_CALENDAR_TITLE,
    name: APP_CALENDAR_NAME,
    color: APP_CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    source: {
      type: Calendar.SourceType.LOCAL,
      name: APP_CALENDAR_NAME,
      isLocalAccount: true,
    },
    ownerAccount: "personal",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
};

export const parseTaskDueAt = (metadata?: Record<string, unknown>) => {
  const dueAt = typeof metadata?.dueAt === "string" ? new Date(metadata.dueAt) : undefined;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return undefined;
  const dueEndAt = typeof metadata?.dueEndAt === "string" ? new Date(metadata.dueEndAt) : undefined;
  return {
    dueAt,
    dueEndAt: dueEndAt && !Number.isNaN(dueEndAt.getTime()) ? dueEndAt : undefined,
  };
};

export const createTaskCalendarEvent = async ({
  title,
  content,
  dueAt,
  dueEndAt,
}: {
  title: string;
  content: string;
  dueAt: Date;
  dueEndAt?: Date;
}) => {
  const permission = await Calendar.getCalendarPermissionsAsync();
  const granted = permission.granted ? permission : await Calendar.requestCalendarPermissionsAsync();
  if (!granted.granted) throw new Error("Calendar permission is required.");

  const calendarId = await ensureAppCalendarId();
  const endDate = dueEndAt && dueEndAt > dueAt ? dueEndAt : new Date(dueAt.getTime() + 60 * 60 * 1000);
  return Calendar.createEventAsync(calendarId, {
    title,
    notes: content,
    startDate: dueAt,
    endDate,
  });
};
