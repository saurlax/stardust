import { fetch as expoFetch } from "expo/fetch";

import type { ChatMessage, MessageToolCard, ToolCardType } from "@/lib/chat/types";
import type { AiConfig } from "@/lib/config";
import { resolveApiBaseUrl } from "@/lib/api";

type SendChatRequestOptions = {
  chatId?: string | null;
  config: AiConfig;
  messages: ChatMessage[];
  prompt: string;
  memoryContext?: string;
  imageUri?: string;
  imageMimeType?: string;
  onChatId?: (chatId: string) => void;
  onTextDelta: (delta: string) => void;
};

type SendChatRequestResult = {
  chatId?: string;
  content: string;
  toolCards: MessageToolCard[];
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

type ToolCardDefinition = {
  id: string;
  type: ToolCardType;
  title: string;
  payload: {
    content: string;
    memoryType?: string;
    relationTarget?: string;
    relationTargetType?: string;
    relationType?: string;
    rationale?: string;
    importance?: number;
    dueAt?: string;
    dueEndAt?: string;
  };
};

const SYSTEM_PROMPT = `You are Stardust, the user's local-first memory companion.
Reply naturally, but use tools when you detect information that should be reviewed by the user.

Available tools:
1. save_memory
   Use when the user reveals a durable preference, fact, relationship, project, concern, goal, routine, memory, task, or opinion.
2. append_journal
   Use when the user shares a meaningful recent activity, moment, or observation that should be kept as a lightweight episode.
3. link_entity
   Use when a person, project, place, topic, or object should become part of the user's relationship graph.
   When the user states a relationship between two entities, include relationTarget and relationType.
4. suggest_reflection
   Use when several signals imply a higher-level pattern about the user. Be careful and non-judgmental.
5. mark_open_loop
   Use when the user reveals an unresolved question, recurring concern, or decision that may need future follow-up.

Rules:
- Keep your visible reply natural and concise.
- If something should be saved or reviewed, emit the appropriate tool call.
- Tool payload content must be short, specific, and user-facing.
- Include a short rationale explaining why the item deserves review.
- For tasks, goals, and open loops with a clear date/time, include dueAt as an ISO 8601 timestamp. Include dueEndAt only if an end time is clear.
- Do not state a reflection as fact; phrase it as something to review.
- Do not ask the user to repeat the same information just to save it.`;

const buildSystemPrompt = (memoryContext?: string) =>
  memoryContext?.trim()
    ? `${SYSTEM_PROMPT}\n\nLocal memory context for this turn:\n${memoryContext.trim()}`
    : SYSTEM_PROMPT;

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Propose saving durable long-term user memory.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          memoryType: {
            type: "string",
            enum: [
              "preference",
              "fact",
              "relationship",
              "project",
              "concern",
              "goal",
              "routine",
              "memory",
              "task",
              "opinion",
            ],
          },
          rationale: { type: "string" },
          importance: { type: "number", minimum: 1, maximum: 5 },
          dueAt: { type: "string", description: "ISO 8601 timestamp when this task is due, if clear." },
          dueEndAt: { type: "string", description: "ISO 8601 end timestamp, only if clear." },
        },
        required: ["title", "content", "memoryType", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_journal",
      description: "Propose adding a lightweight journal entry about what the user did or noticed.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["title", "content", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_entity",
      description: "Propose adding an entity to the user's relationship graph.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          memoryType: {
            type: "string",
            enum: ["person", "project", "place", "topic", "object"],
          },
          relationTarget: { type: "string" },
          relationTargetType: {
            type: "string",
            enum: ["person", "project", "place", "topic", "object"],
          },
          relationType: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["title", "content", "memoryType", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_reflection",
      description: "Propose a higher-level pattern or self-understanding for review.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          memoryType: {
            type: "string",
            enum: ["reflection"],
          },
          rationale: { type: "string" },
        },
        required: ["title", "content", "memoryType", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_open_loop",
      description: "Propose tracking an unresolved question, recurring concern, or future follow-up.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          memoryType: {
            type: "string",
            enum: ["concern", "goal", "project"],
          },
          rationale: { type: "string" },
          importance: { type: "number", minimum: 1, maximum: 5 },
          dueAt: { type: "string", description: "ISO 8601 timestamp when follow-up is needed, if clear." },
          dueEndAt: { type: "string", description: "ISO 8601 end timestamp, only if clear." },
        },
        required: ["title", "content", "memoryType", "rationale"],
      },
    },
  },
] as const;

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

const toOpenAIMessages = async (
  messages: ChatMessage[],
  memoryContext?: string,
): Promise<OpenAIMessage[]> => {
  const result: OpenAIMessage[] = [
    { role: "system", content: buildSystemPrompt(memoryContext) },
  ];

  for (const message of messages) {
    if (message.status === "error" || message.status === "pending") continue;

    if (message.role === "assistant") {
      if (message.content) {
        result.push({ role: "assistant", content: message.content });
      }

      continue;
    }

    if (message.imageUri && message.imageMimeType) {
      const imageUrl = await fileUriToDataUrl(message.imageUri, message.imageMimeType);
      result.push({
        role: "user",
        content: [
          ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
          { type: "image_url" as const, image_url: { url: imageUrl } },
        ],
      });
      continue;
    }

    if (message.content) {
      result.push({ role: "user", content: message.content });
    }
  }

  return result;
};

const normalizeToolCards = (cards: ToolCardDefinition[]): MessageToolCard[] =>
  cards.map((card) => ({
    id: card.id,
    type: card.type,
    title: card.title,
    payload: {
      content: card.payload.content,
      memoryType: card.payload.memoryType,
      relationTarget: card.payload.relationTarget,
      relationTargetType: card.payload.relationTargetType,
      relationType: card.payload.relationType,
      rationale: card.payload.rationale,
      importance: card.payload.importance,
      dueAt: card.payload.dueAt,
      dueEndAt: card.payload.dueEndAt,
    },
    status: "pending",
  }));

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
          // Ignore malformed chunks.
        }
      }
    }
  }
};

const sendLocalChatRequest = async ({
  config,
  messages,
  prompt,
  memoryContext,
  imageUri,
  imageMimeType,
  onTextDelta,
}: SendChatRequestOptions): Promise<SendChatRequestResult> => {
  const openAiMessages = await toOpenAIMessages(
    [
      ...messages,
      {
        id: `pending-${Date.now()}`,
        role: "user",
        content: prompt,
        status: "done",
        imageUri,
        imageMimeType,
      },
    ],
    memoryContext,
  );

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
        tool_choice: "auto",
        tools: toolDefinitions,
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
  const toolCalls = new Map<
    number,
    {
      id: string;
      name: ToolCardType;
      arguments: string;
    }
  >();

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

      const chunk = JSON.parse(rawValue) as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: {
                name?: ToolCardType;
                arguments?: string;
              };
            }>;
          };
        }>;
        error?: { message?: string };
      };

      if (chunk.error?.message) {
        throw new Error(chunk.error.message);
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onTextDelta(delta.content);
      }

      for (const toolCall of delta.tool_calls ?? []) {
        const index = toolCall.index ?? 0;
        const existing = toolCalls.get(index) ?? {
          id: toolCall.id ?? `tool-${Date.now()}-${index}`,
          name: toolCall.function?.name ?? "save_memory",
          arguments: "",
        };

        if (toolCall.id) existing.id = toolCall.id;
        if (toolCall.function?.name) existing.name = toolCall.function.name;
        if (toolCall.function?.arguments) {
          existing.arguments += toolCall.function.arguments;
        }

        toolCalls.set(index, existing);
      }
    }
  }

  const toolCards = normalizeToolCards(
    [...toolCalls.values()].flatMap((toolCall) => {
      try {
        const args = JSON.parse(toolCall.arguments) as {
          title?: string;
          content?: string;
          memoryType?: string;
          relationTarget?: string;
          relationTargetType?: string;
          relationType?: string;
          rationale?: string;
          importance?: number;
          dueAt?: string;
          dueEndAt?: string;
        };

        const cardContent = args.content?.trim();
        if (!cardContent) return [];

        return [
          {
            id: toolCall.id,
            type: toolCall.name,
            title: args.title?.trim() || cardContent,
            payload: {
              content: cardContent,
              memoryType: args.memoryType?.trim(),
              relationTarget: args.relationTarget?.trim(),
              relationTargetType: args.relationTargetType?.trim(),
              relationType: args.relationType?.trim(),
              rationale: args.rationale?.trim(),
              importance: args.importance,
              dueAt: args.dueAt?.trim(),
              dueEndAt: args.dueEndAt?.trim(),
            },
          },
        ];
      } catch {
        return [];
      }
    }),
  );

  return {
    content: content.trim(),
    toolCards,
  };
};

export const sendChatRequest = async (
  options: SendChatRequestOptions,
): Promise<SendChatRequestResult> => sendLocalChatRequest(options);
