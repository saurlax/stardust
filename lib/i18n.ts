import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";

export const supportedLocales = ["en", "zh-Hans"] as const;

export type AppLocale = (typeof supportedLocales)[number];
const translations = {
  en: {
    chat: {
      assistantGreeting: "Hi! How can I help?",
      title: "Chat",
      providerReady: "OpenAI-compatible provider",
      providerLoading: "Loading settings...",
      openPersonalPage: "Open personal page",
      openSettings: "Open settings",
      incompleteSettings: "OpenAI-compatible settings are incomplete.",
      noResponse: "No response.",
      requestFailed: "Request failed.",
      defaultImagePrompt: "Describe the image.",
      voiceMessage: "Voice message",
      cameraPermissionRequired: "Camera permission is required to take photos.",
      cameraOpenFailed: "Failed to open camera.",
      libraryOpenFailed: "Failed to open image library.",
      copyMessage: "Copy message",
      retryMessage: "Retry message",
      removeSelectedImage: "Remove selected image",
      switchToVoiceInput: "Switch to voice input",
      switchToTyping: "Switch to typing",
      messagePlaceholder: "Message",
      thinking: "Thinking...",
      voiceInput: "Voice input",
      holdToTalk: "Hold to talk",
      camera: "Camera",
      add: "Add",
    },
    settings: {
      title: "Settings",
      saveSettings: "Save settings",
      saving: "Saving",
      save: "Save",
      description:
        "Configure the local OpenAI-compatible provider used by the chat screen.",
      provider: "Provider",
      providerValue: "openai-compact",
      baseURL: "Base URL",
      baseURLPlaceholder: "https://api.openai.com/v1",
      apiKey: "API key",
      apiKeyPlaceholder: "sk-...",
      model: "Model",
      modelPlaceholder: "gpt-4o-mini",
      temperature: "Temperature",
      temperaturePlaceholder: "0.7",
      saved: "Saved locally.",
      reset: "Reset to defaults.",
      resetSettings: "Reset settings",
      resetButton: "Reset to defaults",
    },
    personal: {
      title: "Personal",
      profileName: "User",
      profileSubtitle: "Your personal space and story",
      memoryTitle: "Memory",
      memoryDescription: "Meet your digital twin in fragments",
      journalTitle: "Journal",
      journalDescription: "Review and manage daily summaries",
      calendarTitle: "Calendar",
      calendarDescription: "Review and manage calendar events",
    },
    memory: {
      title: "Memory",
    },
    journal: {
      title: "My Journal",
      headerTitle: "Daily Notes",
      subtitle: "Short moments captured through the day",
    },
    calendar: {
      title: "My Calendar",
      headerTitle: "Calendar Events",
      subtitle: "Events created in your Stardust calendar",
      loading: "Loading events...",
      permissionRequired: "Calendar permission is required to read events.",
      loadFailed: "Failed to load events from calendar.",
      noEvents: "No events found for this app.",
      untitledEvent: "Untitled event",
    },
  },
  "zh-Hans": {
    chat: {
      assistantGreeting: "你好！我能帮你什么？",
      title: "聊天",
      providerReady: "OpenAI 兼容提供方",
      providerLoading: "正在加载设置...",
      openPersonalPage: "打开个人页",
      openSettings: "打开设置",
      incompleteSettings: "OpenAI 兼容设置不完整。",
      noResponse: "没有返回内容。",
      requestFailed: "请求失败。",
      defaultImagePrompt: "请描述这张图片。",
      voiceMessage: "语音消息",
      cameraPermissionRequired: "拍照需要相机权限。",
      cameraOpenFailed: "无法打开相机。",
      libraryOpenFailed: "无法打开相册。",
      copyMessage: "复制消息",
      retryMessage: "重试消息",
      removeSelectedImage: "移除已选图片",
      switchToVoiceInput: "切换到语音输入",
      switchToTyping: "切换到文字输入",
      messagePlaceholder: "消息",
      thinking: "思考中...",
      voiceInput: "语音输入",
      holdToTalk: "长按说话",
      camera: "相机",
      add: "添加",
    },
    settings: {
      title: "设置",
      saveSettings: "保存设置",
      saving: "保存中",
      save: "保存",
      description: "配置聊天页使用的本地 OpenAI 兼容服务。",
      provider: "提供方",
      providerValue: "openai-compact",
      baseURL: "基础地址",
      baseURLPlaceholder: "https://api.openai.com/v1",
      apiKey: "API 密钥",
      apiKeyPlaceholder: "sk-...",
      model: "模型",
      modelPlaceholder: "gpt-4o-mini",
      temperature: "温度",
      temperaturePlaceholder: "0.7",
      saved: "已保存在本地。",
      reset: "已恢复默认值。",
      resetSettings: "重置设置",
      resetButton: "恢复默认值",
    },
    personal: {
      title: "个人",
      profileName: "用户",
      profileSubtitle: "你的个人空间与故事",
      memoryTitle: "记忆",
      memoryDescription: "通过片段认识你的数字分身",
      journalTitle: "日记",
      journalDescription: "查看和管理每日摘要",
      calendarTitle: "日历",
      calendarDescription: "查看和管理日历事件",
    },
    memory: {
      title: "记忆",
    },
    journal: {
      title: "我的日记",
      headerTitle: "每日记录",
      subtitle: "记录一天中的短暂瞬间",
    },
    calendar: {
      title: "我的日历",
      headerTitle: "日历事件",
      subtitle: "在 Stardust 日历中创建的事件",
      loading: "正在加载事件...",
      permissionRequired: "读取事件需要日历权限。",
      loadFailed: "无法从日历加载事件。",
      noEvents: "这个应用没有找到事件。",
      untitledEvent: "未命名事件",
    },
  },
} as const;

const resolveLocale = (value?: string | null): AppLocale => {
  if (!value) return "en";

  const normalized = value.toLowerCase();
  if (normalized.startsWith("zh")) return "zh-Hans";

  return "en";
};

export const locale = resolveLocale(getLocales()[0]?.languageTag);

const i18n = new I18n(translations as any);
i18n.defaultLocale = "en";
i18n.enableFallback = true;
i18n.locale = locale;

export const t = (key: string) => i18n.t(key) as string;

export const formatMonthDay = (date: Date) =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
  }).format(date);

export const formatTime = (date: Date) =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
