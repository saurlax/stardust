import { Ionicons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { listChatSessionSummaries, type ChatSessionSummary } from "@/lib/db";
import { t } from "@/lib/i18n";

const navigateFromDrawer = (navigation: DrawerContentComponentProps["navigation"], href: Href) => {
  navigation.closeDrawer();
  router.push(href);
};

const compactText = (value: string, fallback: string) => {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return fallback;
  return trimmed.length > 56 ? `${trimmed.slice(0, 56)}...` : trimmed;
};

function DrawerAction({
  icon,
  label,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 rounded-md border border-border bg-card px-3 py-3"
    >
      <View className="mb-2 h-9 w-9 items-center justify-center rounded-full bg-muted">
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="text-sm font-semibold">{label}</Text>
      <Text className="mt-1 text-xs leading-4 text-muted-foreground">{description}</Text>
    </Pressable>
  );
}

function SessionItem({
  session,
  navigation,
}: {
  session: ChatSessionSummary;
  navigation: DrawerContentComponentProps["navigation"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        navigateFromDrawer(navigation, {
          pathname: "/",
          params: { sessionId: session.sessionId },
        } as Href)
      }
      className="gap-1 rounded-md px-3 py-3 active:bg-muted"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm font-semibold">
          {compactText(session.title, t("personal.untitledSession"))}
        </Text>
        <Text className="text-[11px] text-muted-foreground">
          {new Date(session.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <Text className="text-xs leading-4 text-muted-foreground">
        {compactText(session.preview, t("personal.emptySession"))}
      </Text>
    </Pressable>
  );
}

export function PersonalDrawerContent({ navigation }: DrawerContentComponentProps) {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const avatarIconColor = colorScheme === "dark" ? "#0A0A0A" : "#FAFAFA";
  const iconColor = colorScheme === "dark" ? "#FAFAFA" : "#0A0A0A";
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      listChatSessionSummaries(db)
        .then((nextSessions) => {
          if (active) setSessions(nextSessions);
        })
        .catch(() => {
          if (active) setSessions([]);
        });

      return () => {
        active = false;
      };
    }, [db]),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="flex-1 px-4 py-3">
        <View className="flex-row items-center gap-2.5 py-1">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
            <Ionicons name="person" size={20} color={avatarIconColor} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-base font-semibold">{t("personal.profileName")}</Text>
            <Text className="text-xs text-muted-foreground">{t("personal.profileSubtitle")}</Text>
          </View>
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("chat.openSettings")}
            variant="ghost"
            size="icon"
            className="rounded-full"
            onPress={() => navigateFromDrawer(navigation, "/settings")}
          >
            <Ionicons name="settings-outline" size={21} color={iconColor} />
          </Button>
        </View>

        <View className="mt-5 flex-row gap-2">
          <DrawerAction
            icon="hardware-chip-outline"
            label={t("personal.devicesTitle")}
            description={t("personal.devicesDescription")}
            onPress={() => navigateFromDrawer(navigation, "/inbox?tab=devices" as Href)}
          />
          <DrawerAction
            icon="git-network-outline"
            label={t("personal.memoryTitle")}
            description={t("personal.memoryDescription")}
            onPress={() => navigateFromDrawer(navigation, "/memory")}
          />
        </View>

        <View className="mt-6 flex-row items-center justify-between px-0.5">
          <CardDescription>{t("personal.historyTitle")}</CardDescription>
          <Button
            accessibilityRole="button"
            accessibilityLabel={t("personal.newSession")}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onPress={() =>
              navigateFromDrawer(navigation, {
                pathname: "/",
                params: { newSession: String(Date.now()) },
              } as Href)
            }
          >
            <Ionicons name="add-outline" size={19} color={iconColor} />
          </Button>
        </View>

        <ScrollView className="mt-2 flex-1" showsVerticalScrollIndicator={false}>
          {sessions.length ? (
            <View className="gap-1 pb-4">
              {sessions.map((session) => (
                <SessionItem key={session.sessionId} session={session} navigation={navigation} />
              ))}
            </View>
          ) : (
            <View className="min-h-28 items-center justify-center rounded-md border border-dashed border-border px-4">
              <Text className="text-center text-sm text-muted-foreground">
                {t("personal.noHistory")}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
