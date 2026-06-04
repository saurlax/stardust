import "@expo/metro-runtime";

import { registerRootComponent } from "expo";
import { App } from "expo-router/build/qualified-entry";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

async function main() {
  await LoadSkiaWeb({
    locateFile: (file) => {
      if (file.endsWith(".wasm")) {
        return "/canvaskit.wasm";
      }

      return file;
    },
  });

  registerRootComponent(App);
}

void main();
