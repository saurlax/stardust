import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const repoRoot = path.join(mobileRoot, "..", "..");

const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");
const appConfig = read(mobileRoot, "app.json");
const packageJson = read(mobileRoot, "package.json");
const schema = read(mobileRoot, "lib", "db", "schema.ts");
const candidates = read(mobileRoot, "lib", "db", "repositories", "candidates.ts");
const devices = read(mobileRoot, "lib", "db", "repositories", "devices.ts");
const episodes = read(mobileRoot, "lib", "db", "repositories", "episodes.ts");
const memoryRecords = read(mobileRoot, "lib", "db", "repositories", "memoryRecords.ts");
const ble = read(mobileRoot, "lib", "devices", "ble.ts");
const config = read(mobileRoot, "lib", "config.ts");
const chatScreen = read(mobileRoot, "app", "index.tsx");
const chatRuntime = read(mobileRoot, "lib", "chat", "runtime.ts");
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

const readExportedFunction = (source, name) => {
  const match = new RegExp(`export async function ${name}\\s*\\(`).exec(source);
  const start = match?.index ?? -1;
  if (start < 0) return "";
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
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
assertIncludes(chatScreen, "await createEpisode(db", "Chat input episodes must be persisted before AI candidate creation.");
assertIncludes(chatScreen, "await saveChatSessionSnapshot(db", "Chat messages must be persisted before AI candidate creation.");
assertIncludes(candidates, "createEpisodeInCurrentTransaction(db", "Accepted journal candidates must create episodes inside the candidate transaction.");
if (readExportedFunction(candidates, "updateCandidateStatus").includes("createEpisode(db")) {
  throw new Error("Accepted candidates must not open nested episode transactions.");
}
if (chatRuntime.includes('role: "tool"')) {
  throw new Error("Local candidate review results must not be replayed as OpenAI tool messages.");
}

for (const functionName of [
  "updateReflectionContent",
  "archiveReflection",
  "updateStoredMemoryContent",
  "dismissStoredMemory",
]) {
  if (!readExportedFunction(memoryRecords, functionName).includes("runInTransaction(db")) {
    throw new Error(`${functionName} must keep record changes and FTS updates in one transaction.`);
  }
}

assertIncludes(schema, "episode_id TEXT", "Reflections must preserve source episodes.");
assertIncludes(schema, "export const DATABASE_VERSION = 13", "Database version must reflect the current schema.");
for (const constraint of [
  "FOREIGN KEY (episode_id) REFERENCES episodes(episode_id) ON DELETE SET NULL",
  "FOREIGN KEY (candidate_id) REFERENCES memory_candidates(candidate_id) ON DELETE SET NULL",
  "FOREIGN KEY (source_entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE",
  "FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE",
]) {
  assertIncludes(schema, constraint, `Missing schema integrity constraint: ${constraint}`);
}

assertIncludes(devices, "createEpisodeInCurrentTransaction(db", "Device events must create timeline episodes.");
assertIncludes(devices, 'source: "iot"', "Device event episodes must use the iot source.");
assertIncludes(devices, "createEpisodeInCurrentTransaction", "Device events must create episodes inside their existing transaction.");
assertIncludes(devices, "INSERT OR IGNORE INTO device_events", "Device events must be idempotent.");
assertIncludes(devices, "promoteDeviceEventToCandidate", "Device events must be promotable to memory review.");
assertIncludes(devices, "'memory', 'memory'", "Promoted device events must become pending memory candidates.");
assertIncludes(devices, "promotableDeviceEventTypes", "Device event promotion must filter operational events.");

assertIncludes(ble, "Stardust Sense", "BLE device name must match Stardust Sense.");
assertIncludes(ble, "sendStardustDeviceCommand", "Mobile BLE commands are missing.");
assertIncludes(ble, "/^\\d+$/.test", "BLE device uptime timestamps must not be parsed as wall-clock dates.");
assertIncludes(ble, "syncAfterActivate", "BLE activation must allow command sends without duplicate sync commands.");
assertIncludes(ble, "activateStardustDevice(db, ble, readyDevice, { syncAfterActivate: false })", "BLE commands must restore subscriptions before writing commands.");
assertIncludes(ble, "manifestEventId", "BLE manifest events need stable ids that ignore uptime-only changes.");
assertIncludes(ble, "manifest.bootId", "BLE manifest ids must use firmware boot ids when available.");
assertIncludes(ble, "manifest.eventCount", "BLE manifest ids must use firmware event counts when available.");
assertIncludes(ble, "await ensureBlePermissions();", "BLE permission errors should surface before module import failures.");
assertIncludes(appConfig, '"react-native-ble-plx"', "Expo config must include the BLE plugin.");
assertIncludes(appConfig, '"neverForLocation": true', "BLE scan permission should declare neverForLocation.");
assertIncludes(appConfig, '"modes": ["central"]', "BLE plugin must run in central mode for Stardust Sense.");
assertIncludes(packageJson, '"expo-dev-client"', "BLE requires a native development build dependency.");
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

for (const functionName of ["createEpisode", "updateJournalContent"]) {
  if (!readExportedFunction(episodes, functionName).includes("runInTransaction(db")) {
    throw new Error(`${functionName} must keep episode changes and FTS updates in one transaction.`);
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
