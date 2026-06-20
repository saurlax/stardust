import type { EpisodeSource } from "@/lib/db/types";
import { t } from "@/lib/i18n";

const humanize = (value?: string) =>
  value
    ? value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "";

const candidateKindKeys: Record<string, string> = {
  memory: "inbox.pendingFilter.memory",
  journal: "inbox.pendingFilter.journal",
  reflection: "inbox.pendingFilter.reflection",
  entity: "inbox.pendingFilter.entity",
  open_loop: "inbox.pendingFilter.open_loop",
};

const memoryTypeKeys: Record<string, string> = {
  open_loop: "memory.filter.open_loop",
  preference: "memory.filter.preference",
  fact: "memory.filter.fact",
  relationship: "memory.filter.relationship",
  project: "memory.filter.project",
  concern: "memory.filter.concern",
  goal: "memory.filter.goal",
  routine: "memory.filter.routine",
  memory: "memory.filter.memory",
  task: "memory.filter.task",
  opinion: "memory.filter.opinion",
};

const deviceKindKeys: Record<string, string> = {
  "xiao-esp32s3-sense": "devices.kind.xiaoEsp32s3Sense",
};

const deviceEventTypeKeys: Record<string, string> = {
  boot: "devices.eventType.boot",
  capture: "devices.eventType.capture",
  button: "devices.eventType.button",
  serial: "devices.eventType.serial",
  sync: "devices.eventType.sync",
  command: "devices.eventType.command",
  connection: "devices.eventType.connection",
  manifest: "devices.eventType.manifest",
  status: "devices.eventType.status",
  sleep: "devices.eventType.sleep",
};

const sourceTypeKeys: Record<string, string> = {
  chat: "journal.source.chat",
  share: "journal.source.share",
  image: "journal.source.image",
  calendar: "journal.source.calendar",
  iot: "journal.source.iot",
  journal: "journal.source.journal",
  memory: "journal.source.memory",
};

export const getCandidateKindLabel = (kind: string) =>
  candidateKindKeys[kind] ? t(candidateKindKeys[kind]) : humanize(kind);

export const getMemoryTypeLabel = (type?: string) =>
  memoryTypeKeys[type ?? ""] ? t(memoryTypeKeys[type ?? ""]) : humanize(type);

export const getDeviceKindLabel = (kind: string) =>
  deviceKindKeys[kind] ? t(deviceKindKeys[kind]) : humanize(kind);

export const getDeviceEventTypeLabel = (eventType: string) =>
  deviceEventTypeKeys[eventType] ? t(deviceEventTypeKeys[eventType]) : humanize(eventType);

export const getKnowledgeTypeLabel = (source: string, type?: string) => {
  if (!type) return "";
  if (source === "memory") return getMemoryTypeLabel(type);
  if (source === "episode") return sourceTypeKeys[type] ? t(sourceTypeKeys[type]) : humanize(type);
  if (source === "reflection") return t("journal.reflectionEntryPrefix");
  return humanize(type);
};

export const getEpisodeTitleLabel = (source?: EpisodeSource, title?: string) => {
  if (!title) return undefined;
  return source === "iot" ? getDeviceEventTypeLabel(title) : title;
};

export const getEntityTypeLabel = (type: string) => humanize(type);

export const getRelationTypeLabel = (type: string) => humanize(type);
