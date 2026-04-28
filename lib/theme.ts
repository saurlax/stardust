import { StyleSheet } from "react-native";

export const theme = {
  colors: {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceMuted: "#F9FAFB",
    surfaceSoft: "#F3F4F6",
    border: "#E5E7EB",
    borderMuted: "#D1D5DB",
    text: "#111827",
    textMuted: "#6B7280",
    textStrong: "#374151",
    primary: "#2563EB",
    danger: "#B91C1C",
    dangerSoft: "#FEF2F2",
    success: "#065F46",
  },
  radii: {
    card: 14,
    input: 14,
    pill: 18,
    avatar: 28,
  },
  spacing: {
    xxs: 4,
    xs: 6,
    sm: 8,
    md: 12,
    lg: 14,
    xl: 16,
    xxl: 24,
  },
} as const;

export const ui = {
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  header: {
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  description: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: theme.colors.text,
  },
  mutedText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  card: {
    borderRadius: theme.radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  input: {
    minHeight: 46,
    borderRadius: theme.radii.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    fontSize: 15,
  },
  readOnlyInput: {
    justifyContent: "center" as const,
    backgroundColor: theme.colors.surfaceMuted,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  iconButtonCompact: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  primaryAvatar: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.avatar,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.text,
  },
  subtleButton: {
    minHeight: 40,
    justifyContent: "center" as const,
    alignItems: "center",
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
} as const;
