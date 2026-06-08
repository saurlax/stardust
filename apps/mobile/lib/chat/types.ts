export type MessageRole = "user" | "assistant";
export type MessageStatus =
  | "pending"
  | "streaming"
  | "done"
  | "error"
  | "retrying";

export type MemoryCandidateStatus = "pending" | "accepted" | "dismissed";

export type MessageMemoryCandidate = {
  id: string;
  type: string;
  content: string;
  status: MemoryCandidateStatus;
  createdAt?: string;
  editedContent?: string;
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
  };
  candidates?: MessageMemoryCandidate[];
};
