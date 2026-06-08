import { fetch as expoFetch } from "expo/fetch";

import type { AiConfig } from "@/lib/config";
import type { ChatMessage } from "@/lib/chat/types";
import { resolveApiBaseUrl } from "@/lib/api";

export type MemoryCandidate = {
  id: string;
  type: string;
  content: string;
};

type SendChatRequestOptions = {
  chatId?: string | null;
  config: AiConfig;
  messages: ChatMessage[];
  prompt: string;
  imageUri?: string;
  imageMimeType?: string;
  onChatId?: (chatId: string) => void;
  onTextDelta: (delta: string) => void;
};

type SendChatRequestResult = {
  chatId?: string;
  content: string;
  candidates: MemoryCandidate[];
};

type OpenAIMessage =
  | { role: "system" | "assistant"; content: string }
  | {
      role: "user";
      content:
        | string
        | Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
          >;
    };

const SYSTEM_PROMPT = `You are Stardust, the user's personal AI companion.
Your job is to reply naturally while quietly noticing details worth remembering long term.
If you identify a durable preference, memory, task, or opinion, append a hidden JSON block at the end of your reply using exactly this format:

<!--CANDIDATES
[{"id":"<id>","type":"preference|memory|task|opinion","content":"<short summary>"}]
CANDIDATES-->

Do not mention the block in the visible reply. Omit it completely when nothing should be captured.`;

const CANDIDATES_BLOCK_PATTERN =
  /<!--CANDIDATES\s*([\s\S]*?)\s*CANDIDATES-->/;

const toBase64 = (bytes: Uint8Array) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index] ?? 0;
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3;

    result += chars[(chunk >> 18) & 63];
    result += chars[(chunk >> 12) & 63];
    result += index + 1 < bytes.length ? chars[(chunk >> 6) & 63] : "=";
    result += index + 2 < bytes.length ? chars[chunk & 63] : "=";
  }

  return result;
};

const fileUriToDataUrl = async (uri: string, mimeType: string) => {
  const response = await expoFetch(uri);
  if (!response.ok) {
    throw new Error(`Unable to read image file (${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:${mimeType};base64,${toBase64(bytes)}`;
};

const extractCandidatesFromText = (text: string): MemoryCandidate[] => {
  const match = text.match(CANDIDATES_BLOCK_PATTERN);
  if (!match?.[1]) return [];

  try {
    const parsed = JSON.parse(match[1]) as MemoryCandidate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const normalizeAssistantOutput = (
  text: string,
  candidates?: MemoryCandidate[],
) => {
  const parsedCandidates = candidates?.length ? candidates : extractCandidatesFromText(text);
  const content = text.replace(CANDIDATES_BLOCK_PATTERN, "").trim();
  return {
    content,
    candidates: parsedCandidates,
  };
};

const toOpenAIMessages = async (
  messages: ChatMessage[],
): Promise<OpenAIMessage[]> => {
  const result: OpenAIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const message of messages) {
    if (message.status === "error" || message.status === "pending") continue;
    if (!message.content && !message.imageUri) continue;

    if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content });
      continue;
    }

    if (message.imageUri && message.imageMimeType) {
      const imageUrl = await fileUriToDataUrl(
        message.imageUri,
        message.imageMimeType,
      );
      result.push({
        role: "user",
        content: [
          ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
          { type: "image_url" as const, image_url: { url: imageUrl } },
        ],
      });
      continue;
    }

    result.push({ role: "user", content: message.content });
  }

  return result;
};

const parseSSEStream = async (
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
) => {
  if (!response.body) {
    throw new Error("Streaming response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventChunk of events) {
      const dataLines = eventChunk
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6));

      for (const dataLine of dataLines) {
        if (!dataLine || dataLine === "[DONE]") continue;

        try {
          onEvent(JSON.parse(dataLine) as Record<string, unknown>);
        } catch {
          // Ignore malformed chunks and keep the stream alive.
        }
      }
    }
  }
};

const sendCloudChatRequest = async ({
  chatId,
  config,
  prompt,
  onChatId,
  onTextDelta,
}: SendChatRequestOptions): Promise<SendChatRequestResult> => {
  const response = await expoFetch(
    `${resolveApiBaseUrl(config.cloud.apiBaseURL)}/api/v1/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId: chatId ?? undefined,
        content: prompt,
        stream: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  let nextChatId = chatId ?? undefined;
  let content = "";
  let candidates: MemoryCandidate[] = [];
  let streamError: string | null = null;

  await parseSSEStream(response, (event) => {
    const eventType = typeof event.type === "string" ? event.type : "";
    if (eventType === "data-chatId" && typeof event.data === "string") {
      nextChatId = event.data;
      onChatId?.(event.data);
      return;
    }

    if (eventType === "text-delta" && typeof event.delta === "string") {
      content += event.delta;
      onTextDelta(event.delta);
      return;
    }

    if (eventType === "data-memoryCandidate" && Array.isArray(event.data)) {
      candidates = event.data as MemoryCandidate[];
      return;
    }

    if (eventType === "error" && typeof event.errorText === "string") {
      streamError = event.errorText;
    }
  });

  if (streamError) {
    throw new Error(streamError);
  }

  const normalized = normalizeAssistantOutput(content, candidates);
  return {
    chatId: nextChatId,
    content: normalized.content,
    candidates: normalized.candidates,
  };
};

const sendLocalChatRequest = async ({
  config,
  messages,
  prompt,
  imageUri,
  imageMimeType,
  onTextDelta,
}: SendChatRequestOptions): Promise<SendChatRequestResult> => {
  const openAiMessages = await toOpenAIMessages([
    ...messages,
    {
      id: `pending-${Date.now()}`,
      role: "user",
      content: prompt,
      status: "done",
      imageUri,
      imageMimeType,
    },
  ]);

  const response = await expoFetch(
    `${resolveApiBaseUrl(config.local.baseURL)}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.local.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.local.model,
        stream: true,
        messages: openAiMessages,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const rawValue = line.slice(6).trim();
      if (!rawValue || rawValue === "[DONE]") continue;

      try {
        const chunk = JSON.parse(rawValue) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };

        if (chunk.error?.message) {
          throw new Error(chunk.error.message);
        }

        const delta = chunk.choices?.[0]?.delta?.content;
        if (!delta) continue;

        content += delta;
        onTextDelta(delta);
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
  }

  const normalized = normalizeAssistantOutput(content);
  return {
    content: normalized.content,
    candidates: normalized.candidates,
  };
};

export const sendChatRequest = async (
  options: SendChatRequestOptions,
): Promise<SendChatRequestResult> => {
  if (options.config.runtimeMode === "cloud") {
    return sendCloudChatRequest(options);
  }

  return sendLocalChatRequest(options);
};
