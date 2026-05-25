import { useId } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    View,
    type KeyboardTypeOptions,
} from "react-native";

import { theme, ui } from "./theme";
import { Card } from "./Card";

type InputProps = {
  label: string;
  value: string;
  placeholder?: string;
  readOnly?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  onChangeText?: (value: string) => void;
};

export function Input({
  label,
  value,
  placeholder,
  readOnly,
  secureTextEntry,
  keyboardType,
  onChangeText,
}: InputProps) {
  const inputId = useId();

  return (
    <View style={styles.field}>
      <Text nativeID={inputId} style={styles.label}>
        {label}
      </Text>
      {readOnly ? (
        <Card style={[styles.input, styles.readOnlyField]}>
          <Text style={styles.readOnlyText}>{value}</Text>
        </Card>
      ) : (
        <TextInput
          accessibilityLabel={label}
          accessibilityLabelledBy={inputId}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.borderMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: ui.label,
  input: {
    ...ui.input,
  },
  readOnlyField: {
    ...ui.readOnlyInput,
  },
  readOnlyText: { color: theme.colors.textMuted, fontSize: 15, backgroundColor: "transparent" },
});
