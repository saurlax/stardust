import { createContext, useContext, useEffect, useState } from "react";

import {
    type AiConfig,
    createDefaultAiConfig,
    loadAiConfig,
    resetAiConfig,
    sanitizeAiConfig,
    saveAiConfig,
} from "@/lib/config";

type ConfigContextValue = {
  config: AiConfig;
  ready: boolean;
  updateConfig: (next: AiConfig) => Promise<void>;
  resetConfig: () => Promise<void>;
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AiConfig>(createDefaultAiConfig());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    loadAiConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateConfig = async (next: AiConfig) => {
    const safeConfig = sanitizeAiConfig(next);
    setConfig(safeConfig);
    await saveAiConfig(safeConfig);
  };

  const resetConfig = async () => {
    const defaults = await resetAiConfig();
    setConfig(defaults);
  };

  return (
    <ConfigContext.Provider
      value={{ config, ready, updateConfig, resetConfig }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useConfig must be used within ConfigProvider");
  return value;
}
