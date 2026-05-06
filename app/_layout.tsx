import { Stack } from "expo-router";

import { ConfigProvider } from "@/context/config";
import "@/lib/i18n";

export default function RootLayout() {
  return (
    <ConfigProvider>
      <Stack
        screenOptions={{ headerShadowVisible: false, statusBarStyle: "dark" }}
      />
    </ConfigProvider>
  );
}
