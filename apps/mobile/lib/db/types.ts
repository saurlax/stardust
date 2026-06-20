import type { ChatMessage } from "@/lib/chat/types";

export type EpisodeSource = "chat" | "share" | "image" | "calendar" | "iot" | "journal";
export type CandidateKind =
  | "memory"
  | "journal"
  | "reflection"
  | "entity"
  | "open_loop";
export type CandidateStatus = "pending" | "accepted" | "dismissed";
export type MemoryAtomType =
  | "preference"
  | "fact"
  | "relationship"
  | "project"
  | "concern"
  | "goal"
  | "routine"
  | "memory"
  | "task"
  | "opinion";
export type DeviceStatus = "known" | "connected" | "disconnected";

export type ChatSessionRow = {
  session_id: string;
  remote_chat_id: string | null;
};

export type ChatMessageRow = {
  message_id: string;
  role: ChatMessage["role"];
  content: string;
  status: ChatMessage["status"];
  image_uri: string | null;
  image_mime_type: string | null;
  error_text: string | null;
  request_prompt: string | null;
  request_image_uri: string | null;
  request_image_mime_type: string | null;
  request_episode_id: string | null;
  memory_context_json: string | null;
  tool_cards_json: string | null;
  created_at: string;
};

export type Episode = {
  id: string;
  source: EpisodeSource;
  title?: string;
  content: string;
  mediaUri?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MemoryCandidate = {
  id: string;
  sessionId?: string;
  messageId?: string;
  episodeId?: string;
  kind: CandidateKind;
  type: string;
  title: string;
  content: string;
  status: CandidateStatus;
  sourceTitle?: string;
  sourceContent?: string;
  sourceCreatedAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type StoredMemory = {
  id: string;
  sessionId?: string;
  messageId?: string;
  episodeId?: string;
  type: string;
  content: string;
  importance: number;
  sourceTitle?: string;
  sourceContent?: string;
  sourceCreatedAt?: string;
  createdAt: string;
  updatedAt?: string;
  candidateId?: string;
};

export type ReflectionRecord = {
  id: string;
  candidateId?: string;
  episodeId?: string;
  title: string;
  content: string;
  status: "active" | "archived";
  sourceTitle?: string;
  sourceContent?: string;
  sourceCreatedAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type DeviceRecord = {
  id: string;
  name: string;
  kind: string;
  status: DeviceStatus;
  lastSeenAt?: string;
  batteryLevel?: number;
  firmwareVersion?: string;
  eventCount: number;
  pendingReviewCount: number;
  lastEventAt?: string;
};

export type EntityRecord = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt?: string;
};

export type RelationRecord = {
  id: string;
  candidateId?: string;
  episodeId?: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceEntityName?: string;
  targetEntityName?: string;
  sourceTitle?: string;
  sourceContent?: string;
  sourceCreatedAt?: string;
  type: string;
  weight: number;
  createdAt: string;
  updatedAt?: string;
};

export type DeviceEventRecord = {
  id: string;
  deviceId: string;
  deviceName?: string;
  eventType: string;
  content: string;
  metadata?: Record<string, unknown>;
  promotable: boolean;
  candidateId?: string;
  candidateStatus?: CandidateStatus;
  createdAt: string;
};

export type PersonalSnapshot = {
  acceptedMemories: number;
  pendingCards: number;
  openLoopCount: number;
  journalEntries: number;
  episodeCount: number;
  reflectionCount: number;
  entityCount: number;
  relationCount: number;
  deviceCount: number;
  recentMemory?: StoredMemory;
};

export type JournalRecord = {
  id: string;
  content: string;
  kind: string;
  createdAt: string;
  updatedAt?: string;
};

export type JournalEntry = {
  id: string;
  timestamp: string;
  note: string;
  source: EpisodeSource | "memory";
};

export type JournalDay = {
  date: Date;
  entries: JournalEntry[];
};

export type RelevantKnowledge = {
  id: string;
  source: "memory" | "episode" | "reflection" | "entity";
  type?: string;
  content: string;
  createdAt: string;
  rank: number;
};
