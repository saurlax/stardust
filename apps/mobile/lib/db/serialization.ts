import type { MessageMemoryContext, MessageToolCard } from "@/lib/chat/types";

export const parseToolCards = (value?: string | null): MessageToolCard[] | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as MessageToolCard[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const serializeToolCards = (value?: MessageToolCard[]) =>
  value?.length ? JSON.stringify(value) : null;

export const parseMemoryContext = (value?: string | null): MessageMemoryContext[] | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as MessageMemoryContext[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const serializeMemoryContext = (value?: MessageMemoryContext[]) =>
  value?.length ? JSON.stringify(value) : null;
