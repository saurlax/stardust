import { Stack } from "expo-router";

import { ConfigProvider } from "@/context/config";

export default function RootLayout() {
  return (
    <ConfigProvider>
      <Stack
        screenOptions={{ headerShadowVisible: false, statusBarStyle: "dark" }}
      >
        <Stack.Screen
          name="personal"
          options={{ animation: "slide_from_right" }}
        />
      </Stack>
    </ConfigProvider>
  );
}
