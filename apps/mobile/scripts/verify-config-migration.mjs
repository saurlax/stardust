const fs = require("node:fs");
const path = require("node:path");

const configPath = path.join(__dirname, "..", "lib", "config.ts");
const source = fs.readFileSync(configPath, "utf8");

if (source.includes('"cloud"') || source.includes("CloudAiConfig")) {
  throw new Error("Config must remain local-only.");
}

for (const key of ["localBaseURLRequired", "localApiKeyRequired", "localModelRequired"]) {
  if (!source.includes(key)) {
    throw new Error(`Missing validation key: ${key}`);
  }
}

console.log("Local-only config shape looks valid.");
