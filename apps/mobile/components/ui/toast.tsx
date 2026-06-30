import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";

type ToastTone = "success" | "error";

type ToastProps = {
  visible: boolean;
  message: string;
  tone: ToastTone;
};

function Toast({ visible, message, tone }: ToastProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : -12,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  if (!visible && !message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity,
        top: insets.top + 16,
        transform: [{ translateY }],
      }}
      className="absolute left-4 right-4 z-50"
    >
      <View
        className={
          tone === "success"
            ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/95 px-4 py-3"
            : "rounded-2xl border border-destructive/30 bg-destructive px-4 py-3"
        }
      >
        <Text className="text-sm font-medium text-primary-foreground">{message}</Text>
      </View>
    </Animated.View>
  );
}

export { Toast };
export type { ToastProps, ToastTone };
