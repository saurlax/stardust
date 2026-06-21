import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "lib", "config.ts");
const readmePath = path.join(__dirname, "..", "..", "..", "README.md");
const source = fs.readFileSync(configPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

if (source.includes('"cloud"') || source.includes("CloudAiConfig")) {
  throw new Error("Config must remain local-only.");
}

if (readme.includes("Cloud 模式")) {
  throw new Error("README must describe cloud capabilities only as future additions.");
}

for (const key of ["localBaseURLRequired", "localApiKeyRequired", "localModelRequired"]) {
  if (!source.includes(key)) {
    throw new Error(`Missing validation key: ${key}`);
  }
}

console.log("Local-only config shape looks valid.");
