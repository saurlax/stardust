import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "stardust.config.v1";

export type RuntimeMode = "local" | "cloud";

export type LocalAiConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
};

export type CloudAiConfig = {
  apiBaseURL: string;
};

export type AiConfig = {
  runtimeMode: RuntimeMode;
  local: LocalAiConfig;
  cloud: CloudAiConfig;
};

export type AppConfig = {
  version: number;
  ai: AiConfig;
};

type LegacyAiConfig = {
  apiBaseURL?: string;
};

type LegacyAppConfig = {
  version?: number;
  ai?: LegacyAiConfig;
};

export const createDefaultAiConfig = (): AiConfig => ({
  runtimeMode: "local",
  local: {
    baseURL: "",
    apiKey: "",
    model: "",
  },
  cloud: {
    apiBaseURL: "",
  },
});

export const createDefaultConfig = (): AppConfig => ({
  version: 2,
  ai: createDefaultAiConfig(),
});

const trimValue = (value?: string | null) => value?.trim() || "";

const normalizeLocal = (value?: Partial<LocalAiConfig>): LocalAiConfig => ({
  baseURL: trimValue(value?.baseURL),
  apiKey: trimValue(value?.apiKey),
  model: trimValue(value?.model),
});

const normalizeCloud = (value?: Partial<CloudAiConfig>): CloudAiConfig => ({
  apiBaseURL: trimValue(value?.apiBaseURL),
});

const isRuntimeMode = (value: unknown): value is RuntimeMode =>
  value === "local" || value === "cloud";

const migrateLegacyAi = (value?: LegacyAiConfig): AiConfig => ({
  runtimeMode: "cloud",
  local: normalizeLocal(),
  cloud: normalizeCloud({ apiBaseURL: value?.apiBaseURL }),
});

const normalizeAi = (value?: Partial<AiConfig> | LegacyAiConfig): AiConfig => {
  if (value && !("runtimeMode" in value)) {
    return migrateLegacyAi(value as LegacyAiConfig);
  }

  return {
    runtimeMode: isRuntimeMode((value as Partial<AiConfig>)?.runtimeMode)
      ? (value as Partial<AiConfig>).runtimeMode!
      : "local",
    local: normalizeLocal((value as Partial<AiConfig>)?.local),
    cloud: normalizeCloud((value as Partial<AiConfig>)?.cloud),
  };
};

const normalizeConfig = (
  cfg?: Partial<AppConfig> | LegacyAppConfig,
): AppConfig => ({
  version: 2,
  ai: normalizeAi(cfg?.ai),
});

export const deriveAiConfig = (
  value?: Partial<AiConfig> | LegacyAiConfig,
): AiConfig => normalizeAi(value);

export const deriveAppConfig = (
  cfg?: Partial<AppConfig> | LegacyAppConfig,
): AppConfig => normalizeConfig(cfg);

let aiConfigCache = createDefaultAiConfig();

const persistConfig = async (config: AppConfig): Promise<AppConfig> => {
  const next = sanitizeConfig(config);
  aiConfigCache = next.ai;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const loadConfig = async (): Promise<AppConfig> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return persistConfig(createDefaultConfig());
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig> | LegacyAppConfig;
    const next = sanitizeConfig(parsed as AppConfig);
    aiConfigCache = next.ai;

    if (raw !== JSON.stringify(next)) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }

    return next;
  } catch {
    return persistConfig(createDefaultConfig());
  }
};

export const saveConfig = async (config: AppConfig) => {
  await persistConfig(config);
};

export const resetConfig = async (): Promise<AppConfig> => {
  return persistConfig(createDefaultConfig());
};

export const loadAiConfig = async (): Promise<AiConfig> => {
  const cfg = await loadConfig();
  return cfg.ai;
};

export const saveAiConfig = async (ai: AiConfig) => {
  const cfg = await loadConfig();
  const next = normalizeConfig({ ...cfg, ai });
  await saveConfig(next);
};

export const resetAiConfig = async (): Promise<AiConfig> => {
  const defaults = await resetConfig();
  return defaults.ai;
};

export const sanitizeAiConfig = (ai: AiConfig): AiConfig => normalizeAi(ai);

export const sanitizeConfig = (cfg: AppConfig): AppConfig => normalizeConfig(cfg);

export const getCachedAiConfig = (): AiConfig => aiConfigCache;

export const getConfigValidationError = (config: AiConfig) => {
  if (config.runtimeMode === "local") {
    if (!config.local.baseURL.trim()) return "settings.localBaseURLRequired";
    if (!config.local.apiKey.trim()) return "settings.localApiKeyRequired";
    if (!config.local.model.trim()) return "settings.localModelRequired";
    return null;
  }

  if (!config.cloud.apiBaseURL.trim()) {
    return "settings.cloudApiBaseURLRequired";
  }

  return null;
};
