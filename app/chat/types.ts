export type MessageRole = "user" | "assistant";
export type MessageStatus =
  | "pending"
  | "streaming"
  | "done"
  | "error"
  | "retrying";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  error?: string;
  request?: {
    prompt: string;
  };
};
