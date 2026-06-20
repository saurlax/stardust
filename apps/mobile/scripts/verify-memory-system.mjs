import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const repoRoot = path.join(mobileRoot, "..", "..");

const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");
const schema = read(mobileRoot, "lib", "db", "schema.ts");
const devices = read(mobileRoot, "lib", "db", "repositories", "devices.ts");
const ble = read(mobileRoot, "lib", "devices", "ble.ts");
const config = read(mobileRoot, "lib", "config.ts");
const iotSketch = read(repoRoot, "iot", "iot.ino");

const assertIncludes = (source, value, message) => {
  if (!source.includes(value)) {
    throw new Error(message);
  }
};

const readQuotedConst = (source, name) => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
  if (!match?.[1]) {
    throw new Error(`Missing constant: ${name}`);
  }
  return match[1];
};

const requiredTables = [
  "episodes",
  "memory_candidates",
  "memory_atoms",
  "reflections",
  "entities",
  "relations",
  "devices",
  "device_events",
];

for (const table of requiredTables) {
  assertIncludes(schema, `CREATE TABLE IF NOT EXISTS ${table}`, `Missing table: ${table}`);
  assertIncludes(schema, `DROP TABLE IF EXISTS ${table}`, `Migration does not reset table: ${table}`);
}

for (const table of ["journals", "memories", "captures"]) {
  assertIncludes(schema, `DROP TABLE IF EXISTS ${table}`, `Legacy table is not dropped: ${table}`);
}

for (const ftsTable of ["episodes_fts", "memory_atoms_fts", "reflections_fts"]) {
  assertIncludes(schema, `CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable}`, `Missing FTS table: ${ftsTable}`);
  assertIncludes(schema, `DROP TABLE IF EXISTS ${ftsTable}`, `Migration does not reset FTS table: ${ftsTable}`);
}

for (const column of ["memory_context_json", "request_episode_id", "tool_cards_json"]) {
  assertIncludes(schema, column, `Chat persistence is missing column: ${column}`);
}

assertIncludes(schema, "episode_id TEXT", "Reflections must preserve source episodes.");
assertIncludes(schema, "export const DATABASE_VERSION = 12", "Database version must reflect the current schema.");

assertIncludes(devices, "createEpisode(db", "Device events must create timeline episodes.");
assertIncludes(devices, 'source: "iot"', "Device event episodes must use the iot source.");
assertIncludes(devices, "INSERT OR IGNORE INTO device_events", "Device events must be idempotent.");
assertIncludes(devices, "promoteDeviceEventToCandidate", "Device events must be promotable to memory review.");
assertIncludes(devices, "'memory', 'memory'", "Promoted device events must become pending memory candidates.");

assertIncludes(ble, "Stardust Sense", "BLE device name must match Stardust Sense.");
assertIncludes(ble, "sendStardustDeviceCommand", "Mobile BLE commands are missing.");
for (const name of [
  "SERVICE_UUID",
  "STATUS_CHARACTERISTIC_UUID",
  "EVENT_CHARACTERISTIC_UUID",
  "COMMAND_CHARACTERISTIC_UUID",
  "MANIFEST_CHARACTERISTIC_UUID",
]) {
  const mobileValue = readQuotedConst(ble, name);
  const firmwareValue = readQuotedConst(iotSketch, name);
  if (mobileValue !== firmwareValue) {
    throw new Error(`BLE UUID mismatch for ${name}: ${mobileValue} !== ${firmwareValue}`);
  }
}
for (const command of ['"capture"', '"sync"', '"sleep"']) {
  assertIncludes(ble, command, `BLE command is missing: ${command}`);
  assertIncludes(iotSketch, command.slice(1, -1), `IoT sketch does not handle command: ${command}`);
}

if (config.includes('"cloud"') || config.includes("CloudAiConfig")) {
  throw new Error("Config must remain local-only.");
}

console.log("Fusion memory system invariants look valid.");
