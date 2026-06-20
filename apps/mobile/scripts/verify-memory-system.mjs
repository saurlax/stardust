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
const deviceCapabilities = read(mobileRoot, "lib", "devices", "capabilities.ts");
const episodes = read(mobileRoot, "lib", "db", "repositories", "episodes.ts");
const knowledge = read(mobileRoot, "lib", "db", "repositories", "knowledge.ts");
const snapshot = read(mobileRoot, "lib", "db", "repositories", "snapshot.ts");
const memoryRecords = read(mobileRoot, "lib", "db", "repositories", "memoryRecords.ts");
const ble = read(mobileRoot, "lib", "devices", "ble.ts");
const config = read(mobileRoot, "lib", "config.ts");
const chatScreen = read(mobileRoot, "app", "index.tsx");
const chatRuntime = read(mobileRoot, "lib", "chat", "runtime.ts");
const chatMessages = read(mobileRoot, "components", "ChatMessages.tsx");
const journalScreen = read(mobileRoot, "app", "journal.tsx");
const inboxScreen = read(mobileRoot, "app", "inbox.tsx");
const memoryScreen = read(mobileRoot, "app", "memory.tsx");
const settings = read(mobileRoot, "components", "SettingsContent.tsx");
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
assertIncludes(chatScreen, "setChatError(getErrorMessage(error))", "Chat persistence failures must be visible.");
assertIncludes(chatScreen, "void updateCandidateStatus(db, cardId, status, nextContent)", "Chat candidate review must persist before updating local cards.");
assertIncludes(chatScreen, "savedToolCards = []", "Assistant replies must survive candidate persistence failures without showing unsaved cards.");
assertIncludes(chatScreen, 'title: "Open loops"', "Chat context must separate confirmed open loops.");
assertIncludes(chatScreen, 'memory.source === "memory" && memory.type === "open_loop"', "Chat context open-loop section must use confirmed open loops.");
assertIncludes(chatScreen, 'memory.source === "memory" && memory.type !== "open_loop"', "Chat context saved memories must exclude open loops.");
assertIncludes(chatScreen, "Relationship graph", "Chat context must include retrieved relationship graph knowledge.");
assertIncludes(chatMessages, "item.nodeId", "Chat memory context must use graph node ids when available.");
assertIncludes(chatMessages, 'item.source === "relation"', "Chat memory context must handle relation graph results.");
assertIncludes(chatMessages, "getContextTypeLabel", "Chat memory context must label special memory types.");
assertIncludes(chatMessages, 'type === "open_loop"', "Chat memory context must label open loops.");
assertIncludes(journalScreen, "setErrorMessage(t(\"journal.loadFailed\"))", "Episode timeline load failures must be visible.");
assertIncludes(journalScreen, ".catch(onError)", "Journal edit failures must be visible.");
assertIncludes(journalScreen, "sourceCounts", "Episode timeline source filters must expose counts.");
assertIncludes(journalScreen, "sourceCounts[source]", "Episode timeline source filter labels must display counts.");
assertIncludes(journalScreen, "entries.filter((entry) => entry.source === source).length", "Episode timeline source counts must be source-specific.");
assertIncludes(journalScreen, "entityEntryPrefix", "Journal search must label entity graph results.");
assertIncludes(journalScreen, "relationEntryPrefix", "Journal search must label relation graph results.");
assertIncludes(journalScreen, "`entity-${result.id}`", "Journal search must open entity graph results.");
assertIncludes(journalScreen, "result.nodeId", "Journal search must use graph node ids when available.");
assertIncludes(inboxScreen, "function OpenDeviceSettingsButton", "Device inbox empty state must link to device pairing.");
assertIncludes(inboxScreen, 'router.push("/settings")', "Device inbox empty state must open Settings.");
assertIncludes(inboxScreen, "pendingKindFilters", "Pending inbox must expose candidate kind filters.");
assertIncludes(inboxScreen, "visibleCandidates", "Pending inbox must filter candidates before rendering.");
assertIncludes(inboxScreen, "pendingKindCounts", "Pending inbox filters must expose candidate counts.");
assertIncludes(inboxScreen, "candidates.filter((candidate) => candidate.kind === kind).length", "Pending inbox filter counts must be kind-specific.");
assertIncludes(inboxScreen, "pendingKindCounts[kind]", "Pending inbox filter labels must display counts.");
assertIncludes(inboxScreen, "inbox.pendingFilter", "Pending inbox filters must use localized labels.");
assertIncludes(inboxScreen, "deviceEventFilters", "Device inbox must expose device event filters.");
assertIncludes(inboxScreen, "deviceEventFilter", "Device inbox must apply device event filters.");
assertIncludes(inboxScreen, "deviceEventFilterCounts", "Device inbox filters must expose event counts.");
assertIncludes(inboxScreen, "deviceEventFilterCounts[filter]", "Device inbox filter labels must display counts.");
assertIncludes(inboxScreen, "event.promotable && !event.candidateStatus", "Device inbox must separate promotable capture events.");
assertIncludes(inboxScreen, "getCandidateStatusLabel", "Device event review states must use localized labels.");
assertIncludes(inboxScreen, 'event.candidateStatus === "accepted" && event.candidateId', "Accepted device event reviews must link to saved memory.");
assertIncludes(inboxScreen, "nodeId: `memory-${event.candidateId}`", "Accepted device event reviews must open memory graph nodes.");
assertIncludes(candidates, "createEpisodeInCurrentTransaction(db", "Accepted journal candidates must create episodes inside the candidate transaction.");
if (readExportedFunction(candidates, "updateCandidateStatus").includes("createEpisode(db")) {
  throw new Error("Accepted candidates must not open nested episode transactions.");
}
assertIncludes(candidates, 'if (candidate.status === "accepted") return;', "Accepted candidates must not be materialized twice.");
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
assertIncludes(schema, "export const DATABASE_VERSION = 17", "Database version must reflect the current schema.");
for (const check of [
  "CHECK(source IN ('chat', 'share', 'image', 'calendar', 'iot', 'journal'))",
  "CHECK(kind IN ('memory', 'journal', 'reflection', 'entity', 'open_loop'))",
  "CHECK(status IN ('pending', 'accepted', 'dismissed'))",
  "CHECK(status IN ('active', 'archived'))",
  "CHECK(status IN ('known', 'connected', 'disconnected'))",
]) {
  assertIncludes(schema, check, `Missing schema enum check: ${check}`);
}
assertIncludes(schema, "candidate_id TEXT", "Relations must preserve source candidates.");
assertIncludes(schema, "episode_id TEXT", "Relations must preserve source episodes.");
assertIncludes(candidates, "candidate_id, episode_id, source_entity_id", "Entity candidate acceptance must write relation provenance.");
assertIncludes(candidates, "candidate.episodeId ?? null", "Entity relations must retain source episodes.");
assertIncludes(memoryRecords, "LEFT JOIN episodes ON episodes.episode_id = relations.episode_id", "Relation listing must expose source episode details.");
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
assertIncludes(schema, "candidate_id TEXT", "Device events must retain promoted candidate ids.");
assertIncludes(devices, "SET candidate_id = ?", "Device event promotion must link back to the candidate.");
assertIncludes(devices, "memory_candidates.candidate_id = device_events.candidate_id", "Device event review state must use explicit candidate links.");
assertIncludes(devices, "promotableDeviceEventTypes", "Device event promotion must filter operational events.");
assertIncludes(schema, "protocol_version TEXT", "Devices must persist protocol versions.");
assertIncludes(schema, "capabilities_json TEXT", "Devices must persist capability manifests.");
assertIncludes(devices, "parseCapabilities", "Device repository must parse stored capabilities.");
assertIncludes(deviceCapabilities, "getDeviceCapabilityLabel", "Device capabilities need user-facing labels.");
assertIncludes(deviceCapabilities, "getDeviceCapabilitySummary", "Device capability summaries must be shared by device surfaces.");
assertIncludes(deviceCapabilities, "supportsDeviceCommand", "Device command capability checks must be shared by device surfaces.");
assertIncludes(ble, "readCapabilities", "BLE sync must parse manifest capabilities.");
assertIncludes(ble, "protocolVersion", "BLE sync must persist protocol versions.");
assertIncludes(ble, "ensureDeviceCommandCapability", "BLE commands must enforce advertised capabilities.");
assertIncludes(ble, "commandCapabilities", "BLE commands must map commands to advertised capabilities.");
assertIncludes(ble, "createCommandAuditEvent", "BLE commands must record local command audit events.");
assertIncludes(ble, 'eventType: "command"', "BLE command audit events must be device events.");
assertIncludes(ble, 'createCommandAuditEvent(db, deviceId, command, "sent")', "BLE command audit events must record successful sends.");
assertIncludes(ble, 'createCommandAuditEvent(db, deviceId, command, "failed", error)', "BLE command audit events must record failed sends.");
assertIncludes(ble, "createConnectionAuditEvent", "BLE connection changes must record local audit events.");
assertIncludes(ble, 'eventType: "connection"', "BLE connection audit events must be device events.");
assertIncludes(ble, "connection-${deviceId}-${status}-${minuteBucket}", "BLE connection audit events must use stable minute-bucket ids.");
assertIncludes(ble, "!connectedDevices.has(device.id)", "BLE subscription restore must not duplicate already connected devices.");
assertIncludes(ble, 'createConnectionAuditEvent(db, device.id, "restored")', "BLE restore success must be audited.");
assertIncludes(ble, 'createConnectionAuditEvent(db, device.id, "restore_failed", error)', "BLE restore failures must be audited.");
assertIncludes(ble, 'createConnectionAuditEvent(db, readyDevice.id, "disconnected")', "BLE disconnects must be audited.");
assertIncludes(ble, 'createConnectionAuditEvent(db, deviceId, "disconnected")', "Manual BLE disconnects must be audited.");
assertIncludes(settings, "settings.capabilities", "Settings must display device capabilities.");
assertIncludes(settings, "getDeviceCapabilitySummary(device.capabilities)", "Settings must show friendly capability labels.");
assertIncludes(settings, "supportsDeviceCommand", "Settings device commands must respect advertised capabilities.");
assertIncludes(settings, "disabled={!supportsDeviceCommand(device, \"capture\")}", "Settings must disable unsupported capture commands.");
assertIncludes(settings, "captureDeviceUnavailable", "Settings must explain unsupported capture commands.");
assertIncludes(settings, "syncDeviceUnavailable", "Settings must explain unsupported sync commands.");
assertIncludes(settings, "sleepDeviceUnavailable", "Settings must explain unsupported sleep commands.");
assertIncludes(inboxScreen, "inbox.capabilities", "Device inbox must display device capabilities.");
assertIncludes(inboxScreen, "getDeviceCapabilitySummary(device.capabilities)", "Device inbox must show friendly capability labels.");
assertIncludes(inboxScreen, "getDeviceStatusLabel", "Device inbox must use localized device status labels.");
assertIncludes(snapshot, "SELECT COUNT(*) AS count FROM entities", "Personal snapshot must expose entity graph growth.");
assertIncludes(snapshot, "SELECT COUNT(*) AS count FROM relations", "Personal snapshot must expose relation graph growth.");
assertIncludes(snapshot, "memory_candidates.kind = 'open_loop'", "Personal snapshot must expose confirmed open loops.");
assertIncludes(memoryRecords, "memory_candidates.kind AS candidate_kind", "Stored memories must retain their source candidate kind.");
assertIncludes(memoryScreen, '"open_loop"', "Memory screen must expose an open-loop filter.");
assertIncludes(memoryScreen, "candidateKind === \"open_loop\"", "Memory screen must identify confirmed open loops.");
assertIncludes(inboxScreen, "inbox.openLoopBadge", "Saved inbox memories must label confirmed open loops.");
assertIncludes(knowledge, "listEntityRelationKnowledge", "Retrieval must include entity graph knowledge.");
assertIncludes(knowledge, 'source: "entity" as const', "Entity graph retrieval results must be typed.");
assertIncludes(knowledge, 'source: "relation" as const', "Relation graph retrieval results must be typed.");
assertIncludes(knowledge, "memory_candidates.kind AS candidate_kind", "Retrieval must retain memory candidate kinds.");
assertIncludes(knowledge, 'candidate_kind === "open_loop" ? "open_loop"', "Retrieval must label confirmed open loops.");
assertIncludes(knowledge, 'candidate_kind === "open_loop" ? -0.35 : 0', "Retrieval must prioritize confirmed open loops.");
assertIncludes(knowledge, "nodeId: `memory-${item.id}`", "Memory retrieval results must carry graph navigation ids.");
assertIncludes(knowledge, "nodeId: `relation-${item.id}`", "Relation retrieval must navigate to relation graph nodes.");
assertIncludes(knowledge, "nodeId:", "Entity and relation retrieval results must carry graph navigation ids.");

assertIncludes(ble, "Stardust Sense", "BLE device name must match Stardust Sense.");
assertIncludes(ble, "sendStardustDeviceCommand", "Mobile BLE commands are missing.");
assertIncludes(ble, "/^\\d+$/.test", "BLE device uptime timestamps must not be parsed as wall-clock dates.");
assertIncludes(ble, "syncAfterActivate", "BLE activation must allow command sends without duplicate sync commands.");
assertIncludes(ble, "activateStardustDevice(db, ble, readyDevice, { syncAfterActivate: false })", "BLE commands must restore subscriptions before writing commands.");
assertIncludes(ble, "manifestEventId", "BLE manifest events need stable ids that ignore uptime-only changes.");
assertIncludes(ble, "manifest.bootId", "BLE manifest ids must use firmware boot ids when available.");
assertIncludes(ble, "manifest.eventCount", "BLE manifest ids must use firmware event counts when available.");
assertIncludes(ble, "fallbackValue", "BLE device event ids must have a stable payload fallback.");
assertIncludes(ble, "event-${stableHash(fallbackValue)}", "BLE event fallback ids must dedupe repeated payloads.");
assertIncludes(ble, "scopedDeviceEventId(readyDevice.id, event.id, characteristic.value)", "BLE event notifications must use stable fallback ids.");
assertIncludes(ble, "await ensureBlePermissions();", "BLE permission errors should surface before module import failures.");
assertIncludes(settings, '"/inbox?tab=devices" as Href', "Settings devices panel must open the device review tab.");
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
