import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { ui } from "@/lib/theme";

type IconButtonProps = PressableProps & {
  children: React.ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  children,
  compact,
  style,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        compact ? ui.iconButtonCompact : ui.iconButton,
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
