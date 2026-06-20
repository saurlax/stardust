export type MessageRole = "user" | "assistant";
export type MessageStatus =
  | "pending"
  | "streaming"
  | "done"
  | "error"
  | "retrying";

export type MemoryCandidateStatus = "pending" | "accepted" | "dismissed";

export type ToolCardType =
  | "save_memory"
  | "append_journal"
  | "link_entity"
  | "suggest_reflection"
  | "mark_open_loop";

export type ToolCardPayload = {
  content: string;
  memoryType?: string;
  relationTarget?: string;
  relationTargetType?: string;
  relationType?: string;
};

export type MessageToolCard = {
  id: string;
  type: ToolCardType;
  status: MemoryCandidateStatus;
  title: string;
  payload: ToolCardPayload;
  createdAt?: string;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt?: string;
  imageUri?: string;
  imageMimeType?: string;
  error?: string;
  request?: {
    prompt: string;
    imageUri?: string;
    imageMimeType?: string;
    episodeId?: string;
  };
  toolCards?: MessageToolCard[];
};
