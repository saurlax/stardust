import { Appearance, StyleSheet } from "react-native";

const colorScheme = Appearance.getColorScheme();
const isDark = colorScheme === "dark";

type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceSoft: string;
  border: string;
  borderMuted: string;
  text: string;
  textMuted: string;
  textStrong: string;
  primary: string;
  primaryMuted: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  surfaceOverlay: string;
  textOnDark: string;
  nebula: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  accentA: string;
  accentB: string;
  accentC: string;
};

const darkColors: ThemeColors = {
  background: "#060716",
  surface: "rgba(255,255,255,0.03)",
  surfaceMuted: "rgba(255,255,255,0.02)",
  surfaceSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)",
  borderMuted: "rgba(255,255,255,0.04)",
  text: "#E6EEF8",
  textMuted: "rgba(230,238,248,0.72)",
  textStrong: "#CFE8FF",
  primary: "#3B82F6",
  primaryMuted: "#93C5FD",
  primarySoft: "rgba(59,130,246,0.16)",
  danger: "#EF4444",
  dangerSoft: "#2A0A0A",
  success: "#10B981",
  successSoft: "rgba(16,185,129,0.08)",
  warning: "#F59E0B",
  warningSoft: "rgba(245,158,11,0.06)",
  info: "#9CA3AF",
  infoSoft: "rgba(6,182,212,0.06)",
  surfaceOverlay: "rgba(255,255,255,0.06)",
  textOnDark: "#FFFFFF",
  nebula: "#05040A",
  gradientStart: "#111827",
  gradientMid: "#374151",
  gradientEnd: "#030712",
  accentA: "#6B7280",
  accentB: "#9CA3AF",
  accentC: "#D1D5DB",
};

const lightColors: ThemeColors = {
  background: "#F5F8FF",
  surface: "rgba(255,255,255,0.78)",
  surfaceMuted: "rgba(255,255,255,0.6)",
  surfaceSoft: "rgba(255,255,255,0.9)",
  border: "rgba(75,85,99,0.18)",
  borderMuted: "rgba(75,85,99,0.12)",
  text: "#10213D",
  textMuted: "rgba(16,33,61,0.66)",
  textStrong: "#091327",
  primary: "#2563EB",
  primaryMuted: "#93C5FD",
  primarySoft: "rgba(37,99,235,0.14)",
  danger: "#DC2626",
  dangerSoft: "rgba(220,38,38,0.1)",
  success: "#059669",
  successSoft: "rgba(5,150,105,0.1)",
  warning: "#D97706",
  warningSoft: "rgba(217,119,6,0.1)",
  info: "#9CA3AF",
  infoSoft: "rgba(8,145,178,0.1)",
  surfaceOverlay: "rgba(255,255,255,0.52)",
  textOnDark: "#FFFFFF",
  nebula: "#DDEBFF",
  gradientStart: "#F3F4F6",
  gradientMid: "#E5E7EB",
  gradientEnd: "#D1D5DB",
  accentA: "#4B5563",
  accentB: "#9CA3AF",
  accentC: "#E5E7EB",
};

const colors = isDark ? darkColors : lightColors;

export const theme = {
  isDark,
  colors,
  radii: {
    card: 18,
    input: 14,
    pill: 26,
    avatar: 32,
  },
  spacing: {
    xxs: 4,
    xs: 6,
    sm: 8,
    md: 12,
    lg: 14,
    xl: 18,
    xxl: 28,
  },
  shadows: {
    subtleGlow: {
      shadowColor: colors.accentA,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.08 : 0.14,
      shadowRadius: 18,
      elevation: 6,
    },
    strongGlow: {
      shadowColor: colors.accentA,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.16 : 0.22,
      shadowRadius: 28,
      elevation: 10,
    },
  },
} as const;

export const buttonPalette = {
  primary: {
    softBackground: theme.colors.primarySoft,
    softText: theme.colors.primary,
    subtleBorder: theme.isDark ? "rgba(59,130,246,0.28)" : "rgba(37,99,235,0.26)",
    subtleBackground: theme.isDark ? "rgba(59,130,246,0.12)" : "rgba(37,99,235,0.1)",
    subtleText: theme.colors.primary,
    solidBackground: theme.colors.primary,
    solidText: "#FFFFFF",
    line: theme.colors.primary,
  },
  info: {
    softBackground: theme.colors.infoSoft,
    softText: theme.colors.info,
    subtleBorder: theme.isDark ? "rgba(6,182,212,0.14)" : "rgba(8,145,178,0.22)",
    subtleBackground: theme.isDark ? "rgba(6,182,212,0.06)" : "rgba(8,145,178,0.08)",
    subtleText: theme.colors.info,
    solidBackground: theme.colors.info,
    solidText: theme.isDark ? "#051018" : "#FFFFFF",
    line: theme.colors.info,
  },
  warning: {
    softBackground: theme.colors.warningSoft,
    softText: theme.colors.warning,
    subtleBorder: theme.isDark ? "rgba(245,158,11,0.12)" : "rgba(217,119,6,0.2)",
    subtleBackground: theme.isDark ? "rgba(245,158,11,0.06)" : "rgba(217,119,6,0.08)",
    subtleText: theme.colors.warning,
    solidBackground: theme.colors.warning,
    solidText: "#FFFFFF",
    line: theme.colors.warning,
  },
  error: {
    softBackground: theme.colors.dangerSoft,
    softText: theme.colors.danger,
    subtleBorder: theme.isDark ? "rgba(239,68,68,0.12)" : "rgba(220,38,38,0.2)",
    subtleBackground: theme.isDark ? "rgba(239,68,68,0.06)" : "rgba(220,38,38,0.08)",
    subtleText: theme.colors.danger,
    solidBackground: theme.colors.danger,
    solidText: "#FFFFFF",
    line: theme.colors.danger,
  },
  success: {
    softBackground: theme.colors.successSoft,
    softText: theme.colors.success,
    subtleBorder: theme.isDark ? "rgba(16,185,129,0.12)" : "rgba(5,150,105,0.2)",
    subtleBackground: theme.isDark ? "rgba(16,185,129,0.06)" : "rgba(5,150,105,0.08)",
    subtleText: theme.colors.success,
    solidBackground: theme.colors.success,
    solidText: "#FFFFFF",
    line: theme.colors.success,
  },
  neutral: {
    softBackground: theme.colors.surfaceMuted,
    softText: theme.colors.text,
    subtleBorder: theme.colors.border,
    subtleBackground: theme.colors.surfaceSoft,
    subtleText: theme.colors.text,
    solidBackground: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(16,33,61,0.08)",
    solidText: theme.colors.text,
    line: theme.colors.text,
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
    shadowColor: theme.colors.accentA,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: theme.isDark ? 0.06 : 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: theme.radii.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: theme.colors.text,
    backgroundColor: "transparent",
    fontSize: 15,
  },
  readOnlyInput: {
    justifyContent: "center" as const,
    backgroundColor: "transparent",
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.isDark ? "rgba(255,255,255,0.025)" : "rgba(16,33,61,0.06)",
  },
  iconButtonCompact: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.isDark ? "rgba(255,255,255,0.02)" : "rgba(16,33,61,0.06)",
  },
  primaryAvatar: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.avatar,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.surfaceSoft,
  },
  subtleButton: {
    minHeight: 44,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.isDark ? "rgba(255,255,255,0.03)" : "rgba(16,33,61,0.06)",
  },
} as const;

