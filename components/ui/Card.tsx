import { View, type StyleProp, type ViewStyle } from "react-native";

import { ui } from "@/lib/theme";

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[ui.card, style]}>{children}</View>;
}
