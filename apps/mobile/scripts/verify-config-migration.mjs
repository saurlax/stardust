import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "lib", "config.ts");
const readmePath = path.join(__dirname, "..", "..", "..", "README.md");
const source = fs.readFileSync(configPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

if (!source.includes('"cloud"') || !source.includes("AiProvider")) {
  throw new Error("Config must include both local and cloud provider shapes.");
}

if (!source.includes("cloudBaseURLRequired") || !source.includes("cloudModelRequired")) {
  throw new Error("Cloud validation keys must exist.");
}

for (const key of ["localBaseURLRequired", "localApiKeyRequired", "localModelRequired"]) {
  if (!source.includes(key)) {
    throw new Error(`Missing validation key: ${key}`);
  }
}

console.log("Config provider shape looks valid.");
