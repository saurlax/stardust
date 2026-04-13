import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "stardust.config.v1";

export type AiProviderId = "openai-compact";

export type AiConfig = {
  provider: AiProviderId;
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: string;
};

export type AppConfig = {
  version: number;
  ai: AiConfig;
};

export const createDefaultAiConfig = (): AiConfig => ({
  provider: "openai-compact",
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: "0.7",
});

export const createDefaultConfig = (): AppConfig => ({
  version: 1,
  ai: createDefaultAiConfig(),
});

const normalizeAi = (value?: Partial<AiConfig>): AiConfig => ({
  provider: value?.provider || "openai-compact",
  baseURL: value?.baseURL?.trim() || createDefaultConfig().ai.baseURL,
  apiKey: value?.apiKey?.trim() || "",
  model: value?.model?.trim() || createDefaultConfig().ai.model,
  temperature:
    value?.temperature?.trim() || createDefaultConfig().ai.temperature,
});

const normalizeConfig = (cfg?: Partial<AppConfig>): AppConfig => ({
  version: cfg?.version ?? 1,
  ai: normalizeAi(cfg?.ai),
});

export const loadConfig = async (): Promise<AppConfig> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultConfig();

  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return normalizeConfig(parsed);
  } catch {
    return createDefaultConfig();
  }
};

export const saveConfig = async (config: AppConfig) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const resetConfig = async (): Promise<AppConfig> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
  return createDefaultConfig();
};

export const getAiField = async <K extends keyof AiConfig>(
  key: K,
): Promise<AiConfig[K]> => {
  const cfg = await loadConfig();
  return cfg.ai[key];
};

export const setAiField = async <K extends keyof AiConfig>(
  key: K,
  value: AiConfig[K],
): Promise<AppConfig> => {
  const cfg = await loadConfig();
  const next: AppConfig = normalizeConfig({
    ...cfg,
    ai: { ...cfg.ai, [key]: value },
  });
  await saveConfig(next);
  return next;
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

export const sanitizeConfig = (cfg: AppConfig) => normalizeConfig(cfg);
