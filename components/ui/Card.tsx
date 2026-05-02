import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { theme, ui } from "@/lib/theme";

type CardProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  background?: React.ReactNode;
  title?: string;
  description?: string;
  overlayStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  descriptionStyle?: StyleProp<TextStyle>;
};

export function Card({
  children,
  style,
  background,
  title,
  description,
  overlayStyle,
  titleStyle,
  descriptionStyle,
}: CardProps) {
  const hasHeader = Boolean(title || description);
  const useOverlayHeader = Boolean(background);
  const useFlowBody = hasHeader && !useOverlayHeader && Boolean(children);

  return (
    <View style={[ui.card, styles.container, style]}>
      {background ? <View style={styles.background}>{background}</View> : null}
      <View style={styles.content}>
        {hasHeader && useOverlayHeader ? (
          <View style={[styles.overlay, overlayStyle]} pointerEvents="none">
            {title ? <Text style={[styles.title, titleStyle]}>{title}</Text> : null}
            {description ? (
              <Text style={[styles.description, descriptionStyle]}>
                {description}
              </Text>
            ) : null}
          </View>
        ) : null}
        {hasHeader && !useOverlayHeader ? (
          <View style={[styles.header, overlayStyle]}>
            {title ? <Text style={[styles.title, titleStyle]}>{title}</Text> : null}
            {description ? (
              <Text style={[styles.description, descriptionStyle]}>
                {description}
              </Text>
            ) : null}
          </View>
        ) : null}
        {useFlowBody ? <View style={styles.body}>{children}</View> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    position: "relative",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  description: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});
