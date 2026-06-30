import {
  createCandidatesFromToolCards,
  getMemoryCandidate,
  listMemoryCandidates,
  toToolCardsFromCandidates,
  updateCandidateStatus,
} from "@/lib/db/repositories/candidates";
import {
  createChatSession,
  listChatSessionSummaries,
  loadChatSession,
  loadLatestChatSession,
  saveChatSessionSnapshot,
} from "@/lib/db/repositories/chatSessions";
import {
  clearDeviceNetworkCaptureUrl,
  createDeviceEvent,
  createDevicePhotoEvent,
  listDeviceEvents,
  listDevices,
  promoteDeviceEventToCandidate,
  updateDeviceStatus,
  upsertDevice,
} from "@/lib/db/repositories/devices";
import {
  createEpisode,
  listEpisodes,
  listJournalRecords,
  updateJournalContent,
} from "@/lib/db/repositories/episodes";
import {
  archiveReflection,
  dismissStoredMemory,
  listEntities,
  listReflections,
  listRelations,
  listStoredMemories,
  updateReflectionContent,
  updateStoredMemoryContent,
} from "@/lib/db/repositories/memoryRecords";
import { findRelevantKnowledge } from "@/lib/db/repositories/knowledge";
import { getPersonalSnapshot } from "@/lib/db/repositories/snapshot";
import { listJournalDays } from "@/lib/db/repositories/timeline";
import { migrateDbIfNeeded } from "@/lib/db/schema";
import type {
  ChatSessionSummary,
  DeviceEventRecord,
  DeviceRecord,
  DeviceStatus,
  EntityRecord,
  Episode,
  EpisodeSource,
  JournalDay,
  JournalRecord,
  PersonalSnapshot,
  ReflectionRecord,
  RelationRecord,
  RelevantKnowledge,
  StoredMemory,
} from "@/lib/db/types";

export const DATABASE_NAME = "stardust.db";
export { buildMemoryTree } from "@/lib/db/graph";
export {
  createCandidatesFromToolCards,
  getMemoryCandidate,
  listMemoryCandidates,
  toToolCardsFromCandidates,
  updateCandidateStatus,
};
export { createEpisode, listEpisodes, listJournalRecords, updateJournalContent };
export {
  clearDeviceNetworkCaptureUrl,
  createDeviceEvent,
  createDevicePhotoEvent,
  listDeviceEvents,
  listDevices,
  promoteDeviceEventToCandidate,
  updateDeviceStatus,
  upsertDevice,
};
export {
  createChatSession,
  listChatSessionSummaries,
  loadChatSession,
  loadLatestChatSession,
  saveChatSessionSnapshot,
};
export { migrateDbIfNeeded };
export { findRelevantKnowledge };
export { getPersonalSnapshot };
export { listJournalDays };
export {
  archiveReflection,
  dismissStoredMemory,
  listEntities,
  listReflections,
  listRelations,
  listStoredMemories,
  updateReflectionContent,
  updateStoredMemoryContent,
};
export type {
  CandidateKind,
  CandidateStatus,
  ChatSessionSummary,
  DeviceEventRecord,
  DeviceRecord,
  DeviceStatus,
  EntityRecord,
  Episode,
  EpisodeSource,
  JournalDay,
  JournalEntry,
  JournalRecord,
  MemoryAtomType,
  MemoryCandidate,
  PersonalSnapshot,
  ReflectionRecord,
  RelationRecord,
  RelevantKnowledge,
  StoredMemory,
} from "@/lib/db/types";

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createSessionId = () => createId("session");
