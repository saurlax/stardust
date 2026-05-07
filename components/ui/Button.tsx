import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { ui } from "@/lib/theme";

type IconConfig = string;

const buttonPalette = {
  primary: {
    softBackground: "#DBEAFE",
    softText: "#1D4ED8",
    subtleBorder: "#BFDBFE",
    subtleBackground: "#DBEAFE",
    subtleText: "#1D4ED8",
    solidBackground: "#2563EB",
    solidText: "#FFFFFF",
    line: "#2563EB",
  },
  info: {
    softBackground: "#CFFAFE",
    softText: "#155E75",
    subtleBorder: "#A5F3FC",
    subtleBackground: "#CFFAFE",
    subtleText: "#155E75",
    solidBackground: "#0891B2",
    solidText: "#FFFFFF",
    line: "#0E7490",
  },
  warning: {
    softBackground: "#FEF3C7",
    softText: "#92400E",
    subtleBorder: "#FDE68A",
    subtleBackground: "#FEF3C7",
    subtleText: "#92400E",
    solidBackground: "#D97706",
    solidText: "#FFFFFF",
    line: "#B45309",
  },
  error: {
    softBackground: "#FEE2E2",
    softText: "#B91C1C",
    subtleBorder: "#FECACA",
    subtleBackground: "#FEE2E2",
    subtleText: "#B91C1C",
    solidBackground: "#DC2626",
    solidText: "#FFFFFF",
    line: "#B91C1C",
  },
  success: {
    softBackground: "#D1FAE5",
    softText: "#065F46",
    subtleBorder: "#A7F3D0",
    subtleBackground: "#D1FAE5",
    subtleText: "#065F46",
    solidBackground: "#059669",
    solidText: "#FFFFFF",
    line: "#047857",
  },
  neutral: {
    softBackground: "#F3F4F6",
    softText: "#374151",
    subtleBorder: "#E5E7EB",
    subtleBackground: "#F3F4F6",
    subtleText: "#374151",
    solidBackground: "#6B7280",
    solidText: "#FFFFFF",
    line: "#6B7280",
  },
} as const;

type ButtonColor = keyof typeof buttonPalette;
type ButtonVariant = "soft" | "subtle" | "solid" | "outline" | "ghost" | "link";

type ButtonProps = PressableProps & {
  children?: React.ReactNode;
  icon?: IconConfig;
  compact?: boolean;
  color?: ButtonColor;
  variant?: ButtonVariant;
  block?: boolean;
  rounded?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const resolveVariantStyles = (color: ButtonColor, variant: ButtonVariant) => {
  const palette = buttonPalette[color];

  if (variant === "solid") {
    return {
      container: {
        backgroundColor: palette.solidBackground,
        borderColor: palette.solidBackground,
      },
      text: { color: palette.solidText },
    };
  }

  if (variant === "subtle") {
    return {
      container: {
        backgroundColor: palette.subtleBackground,
        borderColor: palette.subtleBorder,
      },
      text: { color: palette.subtleText },
    };
  }

  if (variant === "soft") {
    return {
      container: {
        backgroundColor: palette.softBackground,
        borderColor: "transparent",
      },
      text: { color: palette.softText },
    };
  }

  if (variant === "outline") {
    return {
      container: {
        backgroundColor: "transparent",
        borderColor: palette.line,
      },
      text: { color: palette.line },
    };
  }

  if (variant === "ghost" || variant === "link") {
    return {
      container: {
        backgroundColor: "transparent",
        borderColor: "transparent",
      },
      text: { color: palette.line },
    };
  }

  return {
    container: {
      backgroundColor: palette.softBackground,
      borderColor: "transparent",
    },
    text: { color: palette.softText },
  };
};

export function Button({
  children,
  icon,
  compact,
  color,
  variant,
  block,
  rounded,
  style,
  textStyle,
  disabled,
  ...props
}: ButtonProps) {
  const useLegacyStyle = !color && !variant && !block && !textStyle;
  const nextColor: ButtonColor = color ?? "primary";
  const nextVariant: ButtonVariant = variant ?? "soft";
  const variantStyles = resolveVariantStyles(nextColor, nextVariant);

  const getIconSize = () => {
    if (compact) return 14;
    return 22;
  };

  const getIconColor = () => {
    if (useLegacyStyle || (color && variant)) {
      return (variantStyles.text?.color as string) ?? "#111827";
    }
    return "#111827";
  };

  const renderContent = () => {
    if (icon) {
      return (
        <Ionicons
          name={icon as any}
          size={getIconSize()}
          color={getIconColor()}
        />
      );
    }

    if (typeof children === "string") {
      return (
        <Text
          style={[
            styles.label,
            !useLegacyStyle && variantStyles.text,
            textStyle,
          ]}
        >
          {children}
        </Text>
      );
    }

    return children;
  };

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        useLegacyStyle || icon
          ? compact
            ? ui.iconButtonCompact
            : ui.iconButton
          : compact
            ? ui.iconButtonCompact
            : styles.base,
        !useLegacyStyle && !icon && variantStyles.container,
        !useLegacyStyle && !icon && nextVariant === "link" && styles.link,
        !compact && block && !icon && styles.block,
        rounded && styles.rounded,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {renderContent()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  block: {
    width: "100%",
  },
  rounded: {
    borderRadius: 999,
  },
  link: {
    minHeight: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
