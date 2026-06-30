import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "stardust.config.v2.local";

export type AiProvider = "local" | "cloud";

export type LocalAiConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
};

export type AiConfig = {
  cloud: LocalAiConfig;
  local: LocalAiConfig;
};

export type AppConfig = {
  version: number;
  ai: AiConfig;
};

const trimValue = (value?: string | null) => value?.trim() || "";

const normalizeLocal = (value?: Partial<LocalAiConfig>): LocalAiConfig => ({
  baseURL: trimValue(value?.baseURL),
  apiKey: trimValue(value?.apiKey),
  model: trimValue(value?.model),
});

const normalizeAi = (value?: Partial<AiConfig>): AiConfig => ({
  cloud: normalizeLocal(value?.cloud),
  local: normalizeLocal(value?.local),
});

const normalizeConfig = (cfg?: Partial<AppConfig>): AppConfig => ({
  version: 3,
  ai: normalizeAi(cfg?.ai),
});

export const createDefaultAiConfig = (): AiConfig => ({
  cloud: {
    baseURL: "",
    apiKey: "",
    model: "",
  },
  local: {
    baseURL: "",
    apiKey: "",
    model: "",
  },
});

export const createDefaultConfig = (): AppConfig => ({
  version: 3,
  ai: createDefaultAiConfig(),
});

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
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
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

export const resetConfig = async (): Promise<AppConfig> => persistConfig(createDefaultConfig());

export const loadAiConfig = async (): Promise<AiConfig> => {
  const cfg = await loadConfig();
  return cfg.ai;
};

export const saveAiConfig = async (ai: AiConfig) => {
  const cfg = await loadConfig();
  await saveConfig(normalizeConfig({ ...cfg, ai }));
};

export const resetAiConfig = async (): Promise<AiConfig> => {
  const defaults = await resetConfig();
  return defaults.ai;
};

export const sanitizeAiConfig = (ai: AiConfig): AiConfig => normalizeAi(ai);
export const sanitizeConfig = (cfg: AppConfig): AppConfig => normalizeConfig(cfg);
export const getCachedAiConfig = (): AiConfig => aiConfigCache;

const getProviderConfig = (config: AiConfig, provider: AiProvider) => config[provider];

export const getConfigValidationError = (config: AiConfig, provider: AiProvider = "local") => {
  const current = getProviderConfig(config, provider);
  if (!current.baseURL.trim()) return provider === "local" ? "settings.localBaseURLRequired" : "settings.cloudBaseURLRequired";
  if (!current.apiKey.trim()) return provider === "local" ? "settings.localApiKeyRequired" : "settings.cloudApiKeyRequired";
  if (!current.model.trim()) return provider === "local" ? "settings.localModelRequired" : "settings.cloudModelRequired";
  return null;
};
