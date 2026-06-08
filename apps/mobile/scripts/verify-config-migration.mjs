import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const filePath = path.resolve("apps/mobile/lib/config.ts");
const source = fs.readFileSync(filePath, "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const asyncStorageStub = {
  default: {
    async getItem() {
      return null;
    },
    async setItem() {},
  },
};

const module = { exports: {} };
const context = {
  module,
  exports: module.exports,
  require: (specifier) => {
    if (specifier === "@react-native-async-storage/async-storage") {
      return asyncStorageStub;
    }

    throw new Error(`Unsupported import in verification script: ${specifier}`);
  },
  console,
};

vm.runInNewContext(transpiled, context, { filename: filePath });

const { deriveAppConfig, deriveAiConfig, getConfigValidationError } = module.exports;

const migrated = deriveAppConfig({
  version: 1,
  ai: {
    apiBaseURL: " http://localhost:8080/ ",
  },
});

if (migrated.version !== 2) {
  throw new Error(`Expected version 2 after migration, got ${migrated.version}`);
}

if (migrated.ai.runtimeMode !== "cloud") {
  throw new Error(`Expected migrated runtime mode to be cloud, got ${migrated.ai.runtimeMode}`);
}

if (migrated.ai.cloud.apiBaseURL !== "http://localhost:8080/") {
  throw new Error(`Expected migrated cloud URL to be preserved, got ${migrated.ai.cloud.apiBaseURL}`);
}

const localConfig = deriveAiConfig({
  runtimeMode: "local",
  local: {
    baseURL: " http://localhost:1234/v1 ",
    apiKey: " sk-test ",
    model: " gpt-4.1-mini ",
  },
  cloud: {
    apiBaseURL: "",
  },
});

if (localConfig.local.baseURL !== "http://localhost:1234/v1") {
  throw new Error(`Expected local base URL to be trimmed, got ${localConfig.local.baseURL}`);
}

if (localConfig.local.apiKey !== "sk-test") {
  throw new Error(`Expected local API key to be trimmed, got ${localConfig.local.apiKey}`);
}

if (localConfig.local.model !== "gpt-4.1-mini") {
  throw new Error(`Expected local model to be trimmed, got ${localConfig.local.model}`);
}

if (getConfigValidationError(localConfig) !== null) {
  throw new Error("Expected valid local config to pass validation");
}

const invalidCloudConfig = deriveAiConfig({
  runtimeMode: "cloud",
  local: {
    baseURL: "",
    apiKey: "",
    model: "",
  },
  cloud: {
    apiBaseURL: "   ",
  },
});

if (getConfigValidationError(invalidCloudConfig) !== "settings.cloudApiBaseURLRequired") {
  throw new Error("Expected empty cloud API URL to fail validation");
}

console.log("Config migration and validation checks passed.");
