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

import { buttonPalette, theme, ui } from "./theme";

type IconConfig = string;

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
      return (variantStyles.text?.color as string) ?? theme.colors.text;
    }
    return theme.colors.text;
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
