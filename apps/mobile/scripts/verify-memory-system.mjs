import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const repoRoot = path.join(mobileRoot, "..", "..");

const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");
const appConfig = read(mobileRoot, "app.json");
const packageJson = read(mobileRoot, "package.json");
const readme = read(repoRoot, "README.md");
const schema = read(mobileRoot, "lib", "db", "schema.ts");
const candidates = read(mobileRoot, "lib", "db", "repositories", "candidates.ts");
const devices = read(mobileRoot, "lib", "db", "repositories", "devices.ts");
const deviceCapabilities = read(mobileRoot, "lib", "devices", "capabilities.ts");
const episodes = read(mobileRoot, "lib", "db", "repositories", "episodes.ts");
const knowledge = read(mobileRoot, "lib", "db", "repositories", "knowledge.ts");
const timeline = read(mobileRoot, "lib", "db", "repositories", "timeline.ts");
const snapshot = read(mobileRoot, "lib", "db", "repositories", "snapshot.ts");
const memoryRecords = read(mobileRoot, "lib", "db", "repositories", "memoryRecords.ts");
const memoryGraph = read(mobileRoot, "lib", "db", "graph.ts");
const ble = read(mobileRoot, "lib", "devices", "ble.ts");
const deviceHttp = read(mobileRoot, "lib", "devices", "http.ts");
const config = read(mobileRoot, "lib", "config.ts");
const chatTypes = read(mobileRoot, "lib", "chat", "types.ts");
const dbTypes = read(mobileRoot, "lib", "db", "types.ts");
const layout = read(mobileRoot, "app", "_layout.tsx");
const chatScreen = read(mobileRoot, "app", "index.tsx");
const chatRuntime = read(mobileRoot, "lib", "chat", "runtime.ts");
const chatMessages = read(mobileRoot, "components", "ChatMessages.tsx");
const devicesContent = read(mobileRoot, "components", "DevicesContent.tsx");
const nebulaView = read(mobileRoot, "components", "NebulaView.tsx");
const calendarScreen = read(mobileRoot, "app", "calendar.tsx");
const journalScreen = read(mobileRoot, "app", "journal.tsx");
const inboxScreen = read(mobileRoot, "app", "inbox.tsx");
const memoryScreen = read(mobileRoot, "app", "memory.tsx");
const personalScreen = read(mobileRoot, "app", "personal.tsx");
const personalDrawer = read(mobileRoot, "components", "PersonalDrawerContent.tsx");
const settings = read(mobileRoot, "components", "SettingsContent.tsx");
const memoryLabels = read(mobileRoot, "lib", "memoryLabels.ts");
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
assertIncludes(readme, "日常小步提交", "README must document fast verification for frequent commits.");
assertIncludes(readme, "发布前或合并前再跑完整 `pnpm verify`", "README must document when to run full verification.");
assertIncludes(chatScreen, "createEpisode(db", "Chat input episodes must be persisted before AI candidate creation.");
assertIncludes(chatScreen, "await saveChatSessionSnapshot(db", "Chat messages must be persisted before AI candidate creation.");
assertIncludes(chatScreen, 'type PromptSource = "chat" | "share" | "image"', "Chat prompt pipeline must preserve episode source types.");
assertIncludes(chatScreen, "const episodeSource = sourceOverride ??", "Chat prompt pipeline must allow shared captures to keep their source.");
assertIncludes(chatScreen, "const persistCapture = (snapshotMessages: ChatMessage[])", "Chat prompt pipeline must persist captures before AI requests.");
assertIncludes(chatScreen, "void persistCapture(capturedMessages)", "Chat prompt pipeline must preserve captures even when AI config is incomplete.");
assertIncludes(chatScreen, "type PromptMetadata = Record<string, unknown>", "Chat prompt pipeline must accept source metadata.");
assertIncludes(chatScreen, "metadata?: PromptMetadata", "Chat prompt pipeline must preserve source metadata.");
assertIncludes(chatScreen, 'sendPrompt(sharedText, undefined, undefined, "share", shareMetadata)', "Shared text must enter the AI candidate pipeline.");
assertIncludes(chatScreen, 'sharedImage.path', "Shared images must enter the AI candidate pipeline with media.");
assertIncludes(chatScreen, "sourceOverride !== undefined ? { shareIntent: true }", "Shared captures must preserve share intent metadata.");
assertIncludes(chatScreen, "webUrl: shareIntent.webUrl", "Shared captures must preserve web URLs.");
assertIncludes(chatScreen, "rawText: shareIntent.text", "Shared captures must preserve raw shared text.");
assertIncludes(chatScreen, "fileName: sharedImage.fileName", "Shared image captures must preserve filenames.");
assertIncludes(chatScreen, "fileSize: sharedImage.size", "Shared image captures must preserve file sizes.");
assertIncludes(chatScreen, "setChatError(getErrorMessage(error))", "Chat persistence failures must be visible.");
assertIncludes(chatScreen, "void updateCandidateStatus(db, cardId, status, nextContent)", "Chat candidate review must persist before updating local cards.");
assertIncludes(chatScreen, "savedToolCards = []", "Assistant replies must survive candidate persistence failures without showing unsaved cards.");
assertIncludes(chatScreen, 'title: "Open loops"', "Chat context must separate confirmed open loops.");
assertIncludes(chatScreen, 'memory.source === "memory" && memory.type === "open_loop"', "Chat context open-loop section must use confirmed open loops.");
assertIncludes(chatScreen, 'memory.source === "memory" && memory.type !== "open_loop"', "Chat context saved memories must exclude open loops.");
assertIncludes(chatScreen, "Relationship graph", "Chat context must include retrieved relationship graph knowledge.");
assertIncludes(chatScreen, "memory.title", "Chat prompt context must preserve retrieved knowledge titles.");
assertIncludes(chatScreen, "capturePipeline", "Chat entry must surface the capture pipeline.");
assertIncludes(chatScreen, "pendingDeviceReviewCount", "Chat entry must surface pending screen-off device review work.");
assertIncludes(chatScreen, "episodeCount", "Chat entry must surface captured episode totals.");
assertIncludes(chatScreen, 'router.push("/inbox?tab=devices"', "Chat entry must open device reviews directly.");
assertIncludes(chatScreen, 'router.push("/journal"', "Chat entry must open the episode timeline directly.");
assertIncludes(layout, 'drawerLabel: t("navigation.inbox")', "Drawer must expose Memory Inbox as a localized primary entry.");
assertIncludes(layout, 'drawerIcon: (props) => drawerIconColor(props).inbox', "Drawer must show an icon for the Memory Inbox entry.");
assertIncludes(layout, 'drawerLabel: t("navigation.memory")', "Drawer must expose the Memory graph as a localized entry.");
assertIncludes(layout, 'drawerLabel: t("navigation.journal")', "Drawer must expose the episode timeline as a localized entry.");
assertIncludes(chatMessages, "item.nodeId", "Chat memory context must use graph node ids when available.");
assertIncludes(chatMessages, 'item.source === "relation"', "Chat memory context must handle relation graph results.");
assertIncludes(chatMessages, "getContextTypeLabel", "Chat memory context must label special memory types.");
assertIncludes(chatMessages, 'type === "open_loop"', "Chat memory context must label open loops.");
assertIncludes(chatMessages, "getKnowledgeTypeLabel(item.source, item.type)", "Chat memory context must use user-facing type labels.");
assertIncludes(chatMessages, "getContextSourceLabel", "Chat memory context must use user-facing source labels.");
assertIncludes(chatMessages, "item.title", "Chat memory context must display retrieved knowledge titles.");
assertIncludes(chatMessages, '`/inbox?candidateId=${encodeURIComponent(card.id)}`', "Chat candidate cards must open their matching Inbox candidate.");
assertIncludes(chatMessages, "item.hasMedia", "Chat memory context summaries must flag media episodes.");
assertIncludes(chatScreen, "[media attached]", "Chat prompt context must flag media episodes.");
assertIncludes(knowledge, "episodeContextNote", "Knowledge retrieval must summarize episode source metadata.");
assertIncludes(knowledge, "metadata_json", "Knowledge retrieval must read episode metadata for context notes.");
assertIncludes(chatScreen, "[source:", "Chat prompt context must include episode source notes.");
assertIncludes(chatMessages, "item.contextNote", "Chat context cards must display episode source notes.");
assertIncludes(knowledge, 'isScreenOff: item.type === "iot"', "Knowledge retrieval must flag screen-off IoT episodes.");
assertIncludes(chatMessages, "item.isScreenOff", "Chat memory context summaries must flag screen-off episodes.");
assertIncludes(chatScreen, "[screen-off capture]", "Chat prompt context must flag screen-off episodes.");
assertIncludes(journalScreen, "result.isScreenOff", "Journal search results must flag screen-off episodes.");
assertIncludes(journalScreen, "result.importance", "Journal search results must display memory importance.");
assertIncludes(journalScreen, "result.rationale", "Journal search results must display memory rationales.");
assertIncludes(journalScreen, "setErrorMessage(t(\"journal.loadFailed\"))", "Episode timeline load failures must be visible.");
assertIncludes(journalScreen, ".catch(onError)", "Journal edit failures must be visible.");
assertIncludes(journalScreen, "sourceCounts", "Episode timeline source filters must expose counts.");
assertIncludes(journalScreen, "sourceCounts[source]", "Episode timeline source filter labels must display counts.");
assertIncludes(journalScreen, "entries.filter((entry) => entry.source === source).length", "Episode timeline source counts must be source-specific.");
assertIncludes(journalScreen, "EntrySourceDetails", "Episode timeline entries must display structured source metadata.");
assertIncludes(journalScreen, "journal.calendarLocation", "Episode timeline must surface calendar location metadata.");
assertIncludes(journalScreen, "journal.sharedUrl", "Episode timeline must surface shared URLs.");
assertIncludes(journalScreen, "journal.fileName", "Episode timeline must surface shared file names.");
assertIncludes(journalScreen, "formatFileSize", "Episode timeline must summarize shared file sizes.");
assertIncludes(journalScreen, "journal.imageDimensions", "Episode timeline must surface shared image dimensions.");
assertIncludes(journalScreen, "journal.captureSource", "Episode timeline must surface IoT capture source metadata.");
assertIncludes(journalScreen, "journal.rationale", "Episode timeline must surface accepted journal rationales.");
assertIncludes(candidates, "rationale:", "Journal candidate episodes must retain accepted rationales.");
assertIncludes(calendarScreen, "buildCalendarEpisodeContent(event)", "Calendar episodes must preserve searchable date and location context.");
assertIncludes(calendarScreen, "calendar.location", "Calendar episode content must label locations.");
assertIncludes(timeline, "title: episode.title", "Episode timeline entries must preserve episode titles.");
assertIncludes(timeline, "mediaUri: episode.mediaUri", "Episode timeline entries must preserve media URIs.");
assertIncludes(timeline, "metadata: episode.metadata", "Episode timeline entries must preserve source metadata.");
assertIncludes(knowledge, "hasMedia: !!item.media_uri", "Knowledge retrieval must expose media-bearing episodes.");
assertIncludes(journalScreen, "result.hasMedia", "Journal search results must flag media-bearing episodes.");
assertIncludes(journalScreen, "result.contextNote", "Journal search results must show episode source notes.");
assertIncludes(journalScreen, "function ScreenOffBadge", "Journal timeline must expose screen-off source badges.");
assertIncludes(journalScreen, 'entry.source === "iot"', "Journal screen-off badges must cover IoT episodes.");
assertIncludes(journalScreen, 'getStringMetadata(entry.metadata, "sourceKind") === "iot"', "Journal screen-off badges must cover memories sourced from IoT episodes.");
assertIncludes(journalScreen, "<ScreenOffBadge entry={entry} />", "Journal timeline cards must render screen-off source badges.");
assertIncludes(timeline, 'title: memory.candidateKind === "open_loop"', "Memory timeline entries must preserve memory type labels.");
assertIncludes(timeline, "importance: memory.importance", "Memory timeline entries must expose importance metadata.");
assertIncludes(timeline, "rationale: memory.rationale", "Memory timeline entries must expose rationale metadata.");
assertIncludes(timeline, "sourceKind: memory.sourceKind", "Memory timeline entries must expose source kind metadata.");
assertIncludes(timeline, "nodeId: `memory-${memory.id}`", "Memory timeline entries must carry graph node ids.");
assertIncludes(timeline, "listReflections(db)", "Episode timeline must include confirmed reflections.");
assertIncludes(timeline, 'source: "reflection" as const', "Reflection timeline entries must use the reflection source.");
assertIncludes(timeline, "nodeId: `reflection-${reflection.id}`", "Reflection timeline entries must carry graph node ids.");
assertIncludes(timeline, "sourceKind: reflection.sourceKind", "Reflection timeline entries must expose source kind metadata.");
assertIncludes(timeline, "listRelations(db)", "Episode timeline must include confirmed relations.");
assertIncludes(timeline, 'source: "relation" as const', "Relation timeline entries must use the relation source.");
assertIncludes(timeline, "nodeId: `relation-${relation.id}`", "Relation timeline entries must carry graph node ids.");
assertIncludes(timeline, "weight: relation.weight", "Relation timeline entries must expose relation strength metadata.");
assertIncludes(journalScreen, 'getNumberMetadata(metadata, "importance")', "Journal timeline must render memory importance metadata.");
assertIncludes(journalScreen, 'getNumberMetadata(metadata, "weight")', "Journal timeline must render relation weight metadata.");
assertIncludes(journalScreen, 'sourceKind === "iot"', "Journal timeline must flag screen-off memory entries.");
assertIncludes(journalScreen, "function entryTitle", "Journal timeline must render user-facing entry titles.");
assertIncludes(journalScreen, "function EpisodeMediaPreview", "Journal timeline must render media previews.");
assertIncludes(journalScreen, "source={{ uri: entry.mediaUri }}", "Journal media previews must use episode media URIs.");
assertIncludes(journalScreen, "getEpisodeTitleLabel(entry.source, entry.title)", "IoT timeline titles must use shared device event labels.");
assertIncludes(journalScreen, '"reflection"', "Journal timeline source filters must include reflections.");
assertIncludes(journalScreen, '"relation"', "Journal timeline source filters must include relations.");
assertIncludes(journalScreen, 'entry.source === "memory"', "Memory timeline entries must expose graph navigation.");
assertIncludes(journalScreen, 'entry.source === "reflection"', "Reflection timeline entries must expose graph navigation.");
assertIncludes(journalScreen, 'entry.source === "relation"', "Relation timeline entries must expose graph navigation.");
assertIncludes(journalScreen, "params: { nodeId: entry.nodeId }", "Memory timeline navigation must target the selected graph node.");
assertIncludes(journalScreen, 'entry.source !== "memory"', "Episode timeline entries must expose source navigation.");
assertIncludes(journalScreen, 'entry.source !== "reflection"', "Episode timeline entries must exclude reflection graph entries from source navigation.");
assertIncludes(journalScreen, 'entry.source !== "relation"', "Episode timeline entries must exclude relation graph entries from source navigation.");
assertIncludes(journalScreen, "params: { episodeId: entry.id }", "Episode timeline navigation must target the source episode.");
assertIncludes(journalScreen, "entityEntryPrefix", "Journal search must label entity graph results.");
assertIncludes(journalScreen, "relationEntryPrefix", "Journal search must label relation graph results.");
assertIncludes(journalScreen, "result.title", "Journal search results must display retrieved knowledge titles.");
assertIncludes(journalScreen, "`entity-${result.id}`", "Journal search must open entity graph results.");
assertIncludes(journalScreen, "result.nodeId", "Journal search must use graph node ids when available.");
assertIncludes(personalScreen, "getEpisodeTitle(episode)", "Personal page must show recent episode titles.");
assertIncludes(personalDrawer, "getEpisodeTitle(episode)", "Personal drawer must show recent episode titles.");
assertIncludes(personalScreen, "source={{ uri: episode.mediaUri }}", "Personal page must preview recent episode media.");
assertIncludes(personalDrawer, "source={{ uri: episode.mediaUri }}", "Personal drawer must preview recent episode media.");
assertIncludes(personalScreen, "getEpisodeTitleLabel(episode.source, episode.title)", "Personal page must label IoT episode titles.");
assertIncludes(personalDrawer, "getEpisodeTitleLabel(episode.source, episode.title)", "Personal drawer must label IoT episode titles.");
assertIncludes(personalScreen, 'pathname: "/memory"', "Personal page recent memories must open the memory graph.");
assertIncludes(personalScreen, 'params: { episodeId: episode.id }', "Personal page recent captures must open source episodes.");
assertIncludes(personalDrawer, 'pathname: "/memory"', "Personal drawer recent memories must open the memory graph.");
assertIncludes(personalDrawer, 'params: { episodeId: episode.id }', "Personal drawer recent captures must open source episodes.");
assertIncludes(inboxScreen, "function SummaryTile", "Memory inbox must expose a capture pipeline summary.");
assertIncludes(inboxScreen, "pendingDeviceReviews", "Memory inbox pipeline must count unreviewed device captures.");
assertIncludes(inboxScreen, 'setDeviceEventFilter("promotable")', "Device review summary must jump to promotable device events.");
assertIncludes(devices, "reviewed_event_count", "Device lists must count reviewed capture events.");
assertIncludes(devices, "lower(device_events.event_type) IN ('capture', 'button', 'serial')", "Device lists must scope review counts to promotable capture events.");
assertIncludes(devices, "device_events.candidate_id IS NULL OR memory_candidates.status = 'pending'", "Device lists must count unpromoted captures as pending review work.");
assertIncludes(inboxScreen, "device.reviewedEventCount", "Device inbox cards must display reviewed capture counts.");
assertIncludes(devicesContent, "device.reviewedEventCount", "Devices page cards must display reviewed capture counts.");
assertIncludes(devicesContent, "onRefreshDeviceState", "Devices page must expose a manual HTTP sync action.");
assertIncludes(devicesContent, "syncStardustDeviceHttp(db, device)", "Devices page refresh must sync device events over HTTP.");
assertIncludes(devicesContent, "captureStardustDeviceHttp(db, device)", "Devices page capture must use the HTTP API.");
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
assertIncludes(inboxScreen, "DeviceSelectionSummary", "Device inbox must summarize the selected review scope.");
assertIncludes(inboxScreen, "selectedDeviceId === \"all\"", "Device inbox summary must handle all-device review scope.");
assertIncludes(inboxScreen, "devices.find((device) => device.id === selectedDeviceId)", "Device inbox summary must identify deep-linked devices.");
assertIncludes(inboxScreen, "event.promotable && !event.candidateStatus", "Device inbox must separate promotable capture events.");
assertIncludes(inboxScreen, "emptyFilteredDeviceEvents", "Device inbox must explain empty filtered event lists.");
assertIncludes(inboxScreen, "emptyDeviceEvents", "Device inbox must explain paired devices with no events.");
assertIncludes(inboxScreen, "getCandidateStatusLabel", "Device event review states must use localized labels.");
assertIncludes(inboxScreen, 'event.candidateStatus === "accepted" && event.candidateId', "Accepted device event reviews must link to saved memory.");
assertIncludes(inboxScreen, "nodeId: `memory-memory-${event.candidateId}`", "Accepted device event reviews must open materialized memory graph nodes.");
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
assertIncludes(schema, "export const DATABASE_VERSION = 18", "Database version must reflect the current schema.");
assertIncludes(schema, "metadata", "Episode FTS must include source metadata.");
assertIncludes(episodes, "safeJson(episode.metadata)", "Episode FTS must index source metadata.");
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
assertIncludes(devices, "scopedDeviceEventId(input.deviceId", "Device event ids must be scoped by device in the repository.");
assertIncludes(devices, "eventId.startsWith(`${deviceId}:`)", "Device event ids must not double-scope already scoped ids.");
if (schema.includes("UNIQUE(device_id, device_event_id)")) {
  throw new Error("Device event primary ids are already device-scoped; schema must not carry a redundant composite unique constraint.");
}
assertIncludes(devices, "promoteDeviceEventToCandidate", "Device events must be promotable to memory review.");
assertIncludes(devices, "'memory', 'memory'", "Promoted device events must become pending memory candidates.");
assertIncludes(schema, "candidate_id TEXT", "Device events must retain promoted candidate ids.");
assertIncludes(devices, "SET candidate_id = ?", "Device event promotion must link back to the candidate.");
assertIncludes(devices, "return candidateId", "Device event promotion must return the created candidate id.");
assertIncludes(devices, "memory_candidates.candidate_id = device_events.candidate_id", "Device event review state must use explicit candidate links.");
assertIncludes(devices, "deviceEventRationale(event)", "Device-promoted memory candidates must explain why they need review.");
assertIncludes(devices, "deviceEventImportance(event)", "Device-promoted memory candidates must include suggested importance.");
assertIncludes(devices, "event.metadata?.deviceTimestamp", "Device-promoted rationales must preserve device-time context.");
assertIncludes(devices, "event.metadata?.source", "Device-promoted rationales must preserve capture-source context.");
assertIncludes(devices, "promotableDeviceEventTypes", "Device event promotion must filter operational events.");
assertIncludes(devices, "deviceName: event.deviceName", "Promoted device candidates must retain their device names.");
assertIncludes(devices, "eventMetadata: event.metadata", "Promoted device candidates must retain original device metadata.");
assertIncludes(devices, "eventCreatedAt: event.createdAt", "Promoted device candidates must retain original event timestamps.");
assertIncludes(schema, "protocol_version TEXT", "Devices must persist protocol versions.");
assertIncludes(schema, "capabilities_json TEXT", "Devices must persist capability manifests.");
assertIncludes(devices, "parseCapabilities", "Device repository must parse stored capabilities.");
assertIncludes(devices, "kind = COALESCE(?, devices.kind)", "Device upserts must not overwrite known device kinds with missing manifest values.");
assertIncludes(deviceCapabilities, "getDeviceCapabilityLabel", "Device capabilities need user-facing labels.");
assertIncludes(deviceCapabilities, "getDeviceCapabilitySummary", "Device capability summaries must be shared by device surfaces.");
assertIncludes(deviceCapabilities, "supportsDeviceCommand", "Device command capability checks must be shared by device surfaces.");
assertIncludes(ble, "readCapabilities", "BLE sync must parse manifest capabilities.");
assertIncludes(ble, "readDeviceKind", "BLE sync must parse manifest device kinds.");
assertIncludes(ble, "kind: readDeviceKind(parsed)", "BLE sync must persist device kinds from status and manifest payloads.");
assertIncludes(ble, "protocolVersion", "BLE sync must persist protocol versions.");
assertIncludes(ble, "ensureDeviceCommandCapability", "BLE commands must enforce advertised capabilities.");
assertIncludes(ble, "commandCapabilities", "BLE commands must map commands to advertised capabilities.");
assertIncludes(ble, "createCommandAuditEvent", "BLE commands must record local command audit events.");
assertIncludes(ble, 'eventType: "command"', "BLE command audit events must be device events.");
assertIncludes(ble, 'createCommandAuditEvent(db, deviceId, command, "sent")', "BLE command audit events must record successful sends.");
assertIncludes(ble, 'createCommandAuditEvent(db, deviceId, command, "failed", error)', "BLE command audit events must record failed sends.");
assertIncludes(ble, "createConnectionAuditEvent", "BLE connection changes must record local audit events.");
assertIncludes(ble, 'eventType: "connection"', "BLE connection audit events must be device events.");
assertIncludes(ble, "PROVISION_CHARACTERISTIC_UUID", "BLE must keep only the provisioning characteristic.");
assertIncludes(ble, "sendStardustDeviceWifiConfig", "BLE must support Wi-Fi provisioning.");
assertNotIncludes(ble, "restoreStardustDeviceSubscriptions", "BLE must not restore event subscriptions.");
assertNotIncludes(ble, "sendStardustDeviceCommand", "BLE must not expose capture/sync/sleep commands.");
assertNotIncludes(layout, "DeviceSubscriptionRestorer", "Root layout must not restore BLE subscriptions at startup.");
assertIncludes(devicesContent, "settings.capabilities", "Devices page must display device capabilities.");
assertIncludes(devicesContent, "getDeviceCapabilitySummary(device.capabilities)", "Devices page must show friendly capability labels.");
assertIncludes(devicesContent, "const refreshDeviceState = useCallback", "Devices page must share device and HTTP refresh logic.");
assertIncludes(devicesContent, "getStardustBleStatus()", "Devices page refresh must include BLE provisioning state.");
assertIncludes(devicesContent, "await refreshDeviceState();", "Devices page actions must refresh device state.");
assertIncludes(devicesContent, "networkCaptureUrl", "Devices page capture must require a provisioned HTTP capture URL.");
assertIncludes(deviceHttp, "syncStardustDeviceHttp", "HTTP device sync must be implemented.");
assertIncludes(deviceHttp, "captureStardustDeviceHttp", "HTTP device capture must be implemented.");
assertIncludes(inboxScreen, "inbox.capabilities", "Device inbox must display device capabilities.");
assertIncludes(inboxScreen, "getDeviceCapabilitySummary(device.capabilities)", "Device inbox must show friendly capability labels.");
assertIncludes(inboxScreen, "getDeviceStatusLabel", "Device inbox must use localized device status labels.");
assertIncludes(inboxScreen, "getCandidateKindLabel(candidate.kind)", "Pending candidates must use user-facing kind labels.");
assertIncludes(inboxScreen, "getCandidateTitle(candidate)", "Pending candidates must use user-facing titles.");
assertIncludes(inboxScreen, 'candidate.metadata?.source === "device_event"', "Device candidates must format titles from metadata.");
assertIncludes(chatRuntime, "Include a short rationale", "Chat tools must request candidate rationales.");
assertIncludes(chatTypes, "rationale?: string", "Tool cards must carry candidate rationales.");
assertIncludes(chatTypes, "importance?: number", "Tool cards must carry suggested importance.");
assertIncludes(chatRuntime, "minimum: 1, maximum: 5", "Memory tools must ask for bounded suggested importance.");
assertIncludes(candidates, "candidate.metadata?.rationale", "Candidate metadata must preserve rationales.");
assertIncludes(candidates, "normalizeImportance", "Accepted memories must use bounded suggested importance.");
assertIncludes(candidates, "candidate.metadata?.importance", "Accepted memories must read suggested importance metadata.");
assertIncludes(chatMessages, "card.payload.rationale", "Chat candidate cards must display rationales.");
assertIncludes(chatMessages, 'typeof card.payload.importance === "number"', "Chat candidate cards must display suggested importance.");
assertIncludes(inboxScreen, "candidate.metadata?.rationale", "Inbox candidates must display stored rationales.");
assertIncludes(inboxScreen, "card.payload.importance", "Inbox candidates must display suggested importance.");
assertIncludes(inboxScreen, "getDeviceCandidateContextLines(candidate)", "Device candidates must show screen-off source context.");
assertIncludes(inboxScreen, "inbox.deviceContext", "Device candidate context must have a localized heading.");
assertIncludes(inboxScreen, "eventMetadata?.deviceTimestamp", "Device candidate context must expose device timestamps.");
assertIncludes(inboxScreen, "getDeviceEventTypeLabel(event.eventType)", "Device events must use user-facing event labels.");
assertIncludes(inboxScreen, "getDeviceEventContextLines(event)", "Device events must summarize device metadata context.");
assertIncludes(inboxScreen, 'key !== "deviceTimestamp"', "Device event timestamps should not be repeated as raw metadata.");
assertIncludes(inboxScreen, "getManifestMediaLines(event.metadata)", "Device manifest media placeholders must be summarized.");
assertIncludes(inboxScreen, 'key !== "media"', "Device manifest media should not be repeated as raw metadata.");
assertIncludes(inboxScreen, "inbox.deviceManifestMedia", "Device manifest media summaries must have a localized heading.");
assertIncludes(inboxScreen, "getManifestCaptureSourceLines(event.metadata)", "Device manifest capture sources must be summarized.");
assertIncludes(inboxScreen, 'key !== "captureSources"', "Device manifest capture sources should not be repeated as raw metadata.");
assertIncludes(inboxScreen, "inbox.deviceManifestCaptureSources", "Device manifest capture sources must have a localized heading.");
assertIncludes(inboxScreen, "getManifestCapabilityLines(event.metadata)", "Device manifest capabilities must be summarized.");
assertIncludes(inboxScreen, "getDeviceCapabilityLabel(capability)", "Device manifest capabilities must use friendly labels.");
assertIncludes(inboxScreen, 'key !== "capabilities"', "Device manifest capabilities should not be repeated as raw metadata.");
assertIncludes(inboxScreen, "inbox.deviceManifestCapabilities", "Device manifest capabilities must have a localized heading.");
assertIncludes(inboxScreen, "getManifestTransferPlanLines", "Device manifest cards must summarize transfer plans.");
assertIncludes(inboxScreen, 'key !== "transferPlan"', "Device transfer plans should not be repeated as raw metadata.");
assertIncludes(inboxScreen, "inbox.deviceManifestTransferPlan", "Device manifest transfer plans must have a localized heading.");
assertIncludes(settings, "getDeviceKindLabel(device.kind)", "Settings must use user-facing device kind labels.");
assertIncludes(memoryLabels, "getKnowledgeTypeLabel", "Knowledge search results need shared user-facing type labels.");
assertIncludes(memoryLabels, "xiao-esp32s3-sense", "Device kind labels must cover Stardust Sense hardware.");
assertIncludes(memoryLabels, "devices.eventType.button", "Device event labels must cover screen-off capture events.");
assertIncludes(snapshot, "SELECT COUNT(*) AS count FROM entities", "Personal snapshot must expose entity graph growth.");
assertIncludes(snapshot, "SELECT COUNT(*) AS count FROM relations", "Personal snapshot must expose relation graph growth.");
assertIncludes(snapshot, "memory_candidates.kind = 'open_loop'", "Personal snapshot must expose confirmed open loops.");
assertIncludes(snapshot, "source = 'iot'", "Personal snapshot must count screen-off IoT episodes.");
assertIncludes(snapshot, "FROM device_events", "Personal snapshot must count device review work.");
assertIncludes(snapshot, "lower(device_events.event_type) IN ('capture', 'button', 'serial')", "Personal snapshot device review counts must focus on promotable capture events.");
assertIncludes(snapshot, "device_events.candidate_id IS NULL OR memory_candidates.status = 'pending'", "Personal snapshot device review counts must include unpromoted and pending device captures.");
assertIncludes(snapshot, "pendingDeviceReviewCount", "Personal snapshot must expose pending device review counts.");
assertIncludes(personalScreen, "snapshot.screenOffEpisodeCount", "Personal page must show screen-off episode counts.");
assertIncludes(personalDrawer, "snapshot.screenOffEpisodeCount", "Personal drawer must show screen-off episode counts.");
assertIncludes(personalScreen, "snapshot.pendingDeviceReviewCount", "Personal page must show pending device review counts.");
assertIncludes(personalDrawer, "snapshot.pendingDeviceReviewCount", "Personal drawer must show pending device review counts.");
assertIncludes(personalScreen, '"/inbox?tab=devices" as Href', "Personal page must open the device review inbox.");
assertIncludes(personalDrawer, '"/inbox?tab=devices" as Href', "Personal drawer must open the device review inbox.");
assertIncludes(personalScreen, "getMemorySummaryLabel(memory)", "Personal page recent memories must show importance and source labels.");
assertIncludes(personalDrawer, "getMemorySummaryLabel(memory)", "Personal drawer recent memories must show importance and source labels.");
assertIncludes(personalScreen, "function ScreenOffBadge", "Personal page must expose screen-off source badges.");
assertIncludes(personalDrawer, "function ScreenOffBadge", "Personal drawer must expose screen-off source badges.");
assertIncludes(personalScreen, 'memory.sourceKind === "iot" ? <ScreenOffBadge />', "Personal page recent memories must show screen-off badges.");
assertIncludes(personalDrawer, 'memory.sourceKind === "iot" ? <ScreenOffBadge />', "Personal drawer recent memories must show screen-off badges.");
assertIncludes(personalScreen, "memory.rationale", "Personal page recent memories must expose accepted rationales.");
assertIncludes(personalDrawer, "memory.rationale", "Personal drawer recent memories must expose accepted rationales.");
assertIncludes(personalScreen, "recentReflections", "Personal page must surface recent confirmed reflections.");
assertIncludes(personalDrawer, "recentReflections", "Personal drawer must surface recent confirmed reflections.");
assertIncludes(personalScreen, 'params: { nodeId: `reflection-${reflection.id}` }', "Personal page recent reflections must open the memory graph.");
assertIncludes(personalDrawer, 'params: { nodeId: `reflection-${reflection.id}` }', "Personal drawer recent reflections must open the memory graph.");
assertIncludes(personalScreen, "reflection.rationale", "Personal page recent reflections must expose rationales.");
assertIncludes(personalDrawer, "reflection.rationale", "Personal drawer recent reflections must expose rationales.");
assertIncludes(personalScreen, "recentRelations", "Personal page must surface recent confirmed relations.");
assertIncludes(personalDrawer, "recentRelations", "Personal drawer must surface recent confirmed relations.");
assertIncludes(personalScreen, 'params: { nodeId: `relation-${relation.id}` }', "Personal page recent relations must open relation graph nodes.");
assertIncludes(personalDrawer, 'params: { nodeId: `relation-${relation.id}` }', "Personal drawer recent relations must open relation graph nodes.");
assertIncludes(personalScreen, "getRelationTypeLabel(relation.type)", "Personal page recent relations must use user-facing relation labels.");
assertIncludes(personalDrawer, "getRelationTypeLabel(relation.type)", "Personal drawer recent relations must use user-facing relation labels.");
assertIncludes(personalScreen, 'relation.sourceKind === "iot" ? <ScreenOffBadge />', "Personal page recent relations must show screen-off badges.");
assertIncludes(personalDrawer, 'relation.sourceKind === "iot" ? <ScreenOffBadge />', "Personal drawer recent relations must show screen-off badges.");
assertIncludes(memoryRecords, "memory_candidates.kind AS candidate_kind", "Stored memories must retain their source candidate kind.");
assertIncludes(memoryRecords, "episodes.source AS source_kind", "Stored memories must retain source episode kinds.");
assertIncludes(memoryRecords, "memory_candidates.metadata_json AS candidate_metadata_json", "Confirmed records must retain candidate rationale metadata.");
assertIncludes(memoryRecords, "readRationale(row.candidate_metadata_json)", "Confirmed records must expose candidate rationales.");
assertIncludes(memoryLabels, "getEpisodeTitleLabel", "Episode source titles must use shared user-facing labels.");
assertIncludes(inboxScreen, "function ScreenOffBadge", "Inbox saved records must expose screen-off source badges.");
assertIncludes(inboxScreen, "getSourcePrefix(memory.sourceKind, memory.sourceTitle)", "Inbox saved memory sources must use user-facing episode titles.");
assertIncludes(inboxScreen, "<ScreenOffBadge sourceKind={memory.sourceKind} />", "Inbox saved memories must show screen-off source badges.");
assertIncludes(inboxScreen, "memory.importance", "Inbox saved memories must display importance.");
assertIncludes(inboxScreen, "memory.rationale", "Inbox saved memories must display accepted candidate rationales.");
assertIncludes(inboxScreen, 'params: { nodeId: `memory-${memory.id}` }', "Inbox saved memories must open their Memory graph nodes.");
assertIncludes(inboxScreen, "candidate.createdAt", "Pending candidate cards must expose candidate timestamps.");
assertIncludes(inboxScreen, "candidate.sourceCreatedAt", "Pending candidate source blocks must expose source timestamps.");
assertIncludes(inboxScreen, "candidate.content", "Inbox accept must persist the reviewed candidate content.");
assertIncludes(inboxScreen, "draft.trim() || candidate.content", "Inbox edited candidates must not save blank content.");
assertIncludes(inboxScreen, "getSourcePrefix(reflection.sourceKind, reflection.sourceTitle)", "Inbox reflection sources must use user-facing episode titles.");
assertIncludes(inboxScreen, "<ScreenOffBadge sourceKind={reflection.sourceKind} />", "Inbox reflections must show screen-off source badges.");
assertIncludes(inboxScreen, 'params: { nodeId: `reflection-${reflection.id}` }', "Inbox reflections must open their Memory graph nodes.");
assertIncludes(memoryScreen, "getSourcePrefix(memory.sourceKind, memory.sourceTitle)", "Memory management sources must use user-facing episode titles.");
assertIncludes(memoryScreen, "memory.importance", "Memory management cards must display importance.");
assertIncludes(memoryScreen, "memory.rationale", "Memory management cards must display accepted candidate rationales.");
assertIncludes(memoryScreen, "selectedNode.rationale", "Memory graph details must display accepted candidate rationales.");
assertIncludes(memoryScreen, "b.weight - a.weight", "Entity graph details must prioritize stronger relations.");
assertIncludes(memoryScreen, "memory.relatedRelations", "Entity graph details must show related relation counts.");
assertIncludes(memoryScreen, "getSourcePrefix(reflections[0].sourceKind, reflections[0].sourceTitle)", "Memory reflection summaries must expose source episode titles.");
assertIncludes(memoryScreen, "OpenSourceButton episodeId={reflections[0].episodeId}", "Memory reflection summaries must open source episodes.");
assertIncludes(memoryScreen, '"open_loop"', "Memory screen must expose an open-loop filter.");
assertIncludes(memoryScreen, "candidateKind === \"open_loop\"", "Memory screen must identify confirmed open loops.");
assertIncludes(memoryScreen, "graphLegendItems", "Memory screen must explain graph node accents.");
assertIncludes(memoryScreen, "graphLegendCounts", "Memory graph legend must show node-type counts.");
assertIncludes(memoryScreen, 'memory.sourceKind === "iot"', "Memory graph legend must count screen-off IoT memories.");
assertIncludes(memoryScreen, "memory.graphLegend", "Memory graph accent legend must be localized.");
assertIncludes(memoryScreen, "nodeNotFoundTitle", "Memory screen must explain stale graph navigation targets.");
assertIncludes(memoryScreen, "setSelectedNodeId(\"root\")", "Memory screen must let users recover from stale graph targets.");
assertIncludes(memoryGraph, "accent:", "Memory graph must assign node accents.");
assertIncludes(memoryGraph, '? "iot"', "Memory graph must accent IoT-sourced memories.");
assertIncludes(memoryGraph, 'memory.sourceKind === "iot"', "Memory graph must identify screen-off memory sources.");
assertIncludes(memoryGraph, 'relation.sourceKind === "iot"', "Memory graph must accent IoT-sourced relations.");
assertIncludes(memoryScreen, 'relations.filter((relation) => relation.sourceKind === "iot").length', "Memory graph legend must count IoT-sourced relations.");
assertIncludes(nebulaView, "accentColors", "Nebula graph must render node accents.");
assertIncludes(inboxScreen, "inbox.openLoopBadge", "Saved inbox memories must label confirmed open loops.");
assertIncludes(knowledge, "listEntityRelationKnowledge", "Retrieval must include entity graph knowledge.");
assertIncludes(knowledge, 'source: "entity" as const', "Entity graph retrieval results must be typed.");
assertIncludes(knowledge, 'source: "relation" as const', "Relation graph retrieval results must be typed.");
assertIncludes(knowledge, "episodes.source AS source_kind", "Relation retrieval must preserve source episode kinds.");
assertIncludes(knowledge, 'item.source_kind === "iot"', "Relation retrieval must flag screen-off graph context.");
assertIncludes(chatScreen, "memory.contextNote", "Chat prompt context must include source notes for graph results.");
assertIncludes(knowledge, "ORDER BY relations.weight DESC, relations.updated_at DESC", "Relation retrieval must select stronger graph relations before applying limits.");
assertIncludes(knowledge, "memory_candidates.kind AS candidate_kind", "Retrieval must retain memory candidate kinds.");
assertIncludes(knowledge, "memory_atoms.importance AS importance", "Retrieval must retain memory importance.");
assertIncludes(knowledge, "memory_candidates.metadata_json AS candidate_metadata_json", "Retrieval must retain memory candidate rationale metadata.");
assertIncludes(knowledge, "readRationale(item.candidate_metadata_json)", "Retrieval results must expose memory rationales.");
assertIncludes(knowledge, "importanceBoost(item.importance)", "Retrieval ranking must account for memory importance.");
assertIncludes(knowledge, "relationWeightBoost(item.weight)", "Retrieval ranking must account for relation strength.");
assertIncludes(knowledge, "importance: item.importance", "Retrieval results must expose memory importance.");
assertIncludes(knowledge, "rationale: readRationale(item.candidate_metadata_json)", "Retrieval results must map memory rationales.");
assertIncludes(knowledge, 'candidate_kind === "open_loop" ? "open_loop"', "Retrieval must label confirmed open loops.");
assertIncludes(knowledge, 'candidate_kind === "open_loop" ? -0.35 : 0', "Retrieval must prioritize confirmed open loops.");
assertIncludes(knowledge, "nodeId: `memory-${item.id}`", "Memory retrieval results must carry graph navigation ids.");
assertIncludes(knowledge, "nodeId: `relation-${item.id}`", "Relation retrieval must navigate to relation graph nodes.");
assertIncludes(knowledge, "nodeId:", "Entity and relation retrieval results must carry graph navigation ids.");
assertIncludes(knowledge, "episodes.title AS title", "Episode retrieval must preserve titles for chat context.");
assertIncludes(knowledge, "reflections.title AS title", "Reflection retrieval must preserve titles for chat context.");
assertIncludes(knowledge, "episodes.source AS source_kind", "Reflection retrieval must preserve source episode kinds.");
assertIncludes(knowledge, "nodeId: `reflection-${item.id}`", "Reflection retrieval results must navigate to reflection graph nodes.");
assertIncludes(knowledge, 'isScreenOff: item.source_kind === "iot"', "Reflection retrieval must flag screen-off source context.");
assertIncludes(knowledge, "title LIKE ? OR content LIKE ? OR source LIKE ? OR metadata_json LIKE ?", "Episode fallback retrieval must search title, content, source, and metadata.");
assertIncludes(knowledge, "...episodeParams", "Episode fallback retrieval must bind metadata search parameters separately from memory parameters.");
assertIncludes(knowledge, 'item.metadata_json ?? ""', "Episode fallback ranking must account for metadata matches.");
assertIncludes(knowledge, "title LIKE ? OR content LIKE ?", "Reflection fallback retrieval must search titles and content.");
assertIncludes(chatTypes, "importance?: number", "Chat memory context must carry memory importance.");
assertIncludes(chatTypes, "rationale?: string", "Chat memory context must carry memory rationales.");
assertIncludes(dbTypes, "importance?: number", "Relevant knowledge must carry memory importance.");
assertIncludes(dbTypes, "rationale?: string", "Relevant knowledge must carry memory rationales.");
assertIncludes(chatScreen, "[importance", "Chat prompt context must include memory importance.");
assertIncludes(chatScreen, "[why:", "Chat prompt context must include memory rationales.");
assertIncludes(chatMessages, 't("inbox.importance")', "Chat context cards must display memory importance.");
assertIncludes(chatMessages, 'item.rationale', "Chat context cards must display memory rationales.");

assertIncludes(ble, "Stardust Sense", "BLE device name must match Stardust Sense.");
assertIncludes(ble, "PROVISION_CHARACTERISTIC_UUID", "Mobile BLE layer must only keep provisioning.");
assertIncludes(ble, "readCharacteristicForService(SERVICE_UUID, PROVISION_CHARACTERISTIC_UUID)", "Mobile BLE layer must read provisioning results.");
assertIncludes(ble, "await ensureBlePermissions();", "BLE permission errors should surface before module import failures.");
assertIncludes(deviceHttp, "fetchJson<HttpDeviceEvent[]>(`${baseUrl}/events`)", "Device events must sync over HTTP.");
assertIncludes(deviceHttp, "eventMediaUrl", "HTTP device events must preserve media URLs.");
assertIncludes(deviceHttp, "staticPath", "HTTP device events must support /static file links.");
assertIncludes(devicesContent, '"/inbox?tab=devices" as Href', "Devices panel must open the device review tab.");
assertIncludes(devicesContent, "openDeviceInbox", "Devices panel must open device review.");
assertIncludes(inboxScreen, "params.deviceId", "Device inbox must accept selected device route params.");
assertIncludes(inboxScreen, "setSelectedDeviceId(params.deviceId)", "Device inbox route params must select devices.");
assertIncludes(inboxScreen, 'params.tab === "devices"', "Device inbox route params must detect device review routes.");
assertIncludes(inboxScreen, 'setDeviceEventFilter("promotable")', "Device inbox route params must focus promotable captures.");
assertIncludes(appConfig, '"react-native-ble-plx"', "Expo config must include the BLE plugin.");
assertIncludes(appConfig, '"neverForLocation": true', "BLE scan permission should declare neverForLocation.");
assertIncludes(appConfig, '"modes": ["central"]', "BLE plugin must run in central mode for Stardust Sense.");
assertIncludes(packageJson, '"expo-dev-client"', "BLE requires a native development build dependency.");
for (const name of [
  "SERVICE_UUID",
  "PROVISION_CHARACTERISTIC_UUID",
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

if (!config.includes('"cloud"') || !config.includes("AiProvider")) {
  throw new Error("Config must include both local and cloud provider shapes.");
}

console.log("Fusion memory system invariants look valid.");
