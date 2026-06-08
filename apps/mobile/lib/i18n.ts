import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";

export const supportedLocales = ["en", "zh-Hans"] as const;

export type AppLocale = (typeof supportedLocales)[number];
const translations = {
  en: {
    chat: {
      assistantGreeting: "Hi! How can I help?",
      title: "Chat",
      providerReady: "Stardust AI",
      providerLoading: "Connecting...",
      openPersonalPage: "Open personal page",
      openSettings: "Open settings",
      incompleteSettings: "API base URL is not configured.",
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
      send: "Send",
    },
    settings: {
      title: "Settings",
      saveSettings: "Save settings",
      saving: "Saving",
      save: "Save",
      description: "Choose whether Stardust talks to a local model endpoint or a cloud API.",
      modeLabel: "Runtime mode",
      localTab: "Local",
      cloudTab: "Cloud",
      localDescription:
        "Connect directly to an OpenAI-compatible model endpoint from this device.",
      cloudDescription:
        "Send chat requests to a Stardust API that handles cloud orchestration.",
      localBaseURL: "OpenAI-Compatible Base URL",
      localBaseURLPlaceholder: "http://localhost:1234/v1",
      localApiKey: "API Key",
      localApiKeyPlaceholder: "sk-...",
      localModel: "Model",
      localModelPlaceholder: "gpt-4.1-mini",
      apiBaseURL: "API Base URL",
      apiBaseURLPlaceholder: "http://localhost:8080",
      saved: "Saved locally.",
      testConnection: "Test connection",
      testingConnection: "Testing...",
      testPassed: "Connection succeeded.",
      testFailed: "Connection failed.",
      localBaseURLRequired: "OpenAI-compatible base URL is required.",
      localApiKeyRequired: "API key is required in local mode.",
      localModelRequired: "Model is required in local mode.",
      cloudApiBaseURLRequired: "API base URL is required in cloud mode.",
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
      providerReady: "Stardust AI",
      providerLoading: "连接中...",
      openPersonalPage: "打开个人页",
      openSettings: "打开设置",
      incompleteSettings: "API 地址未配置。",
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
      send: "发送",
    },
    settings: {
      title: "设置",
      saveSettings: "保存设置",
      saving: "保存中",
      save: "保存",
      description: "选择 Stardust 连接本地模型端点还是云端 API。",
      modeLabel: "运行模式",
      localTab: "本地",
      cloudTab: "云端",
      localDescription: "由设备直接连接 OpenAI 兼容模型接口。",
      cloudDescription: "由应用只连接 Stardust API，由云端负责编排。",
      localBaseURL: "OpenAI 兼容 Base URL",
      localBaseURLPlaceholder: "http://localhost:1234/v1",
      localApiKey: "API Key",
      localApiKeyPlaceholder: "sk-...",
      localModel: "模型",
      localModelPlaceholder: "gpt-4.1-mini",
      apiBaseURL: "API 地址",
      apiBaseURLPlaceholder: "http://localhost:8080",
      saved: "已保存在本地。",
      testConnection: "测试连接",
      testingConnection: "测试中...",
      testPassed: "连接成功。",
      testFailed: "连接失败。",
      localBaseURLRequired: "本地模式下必须填写 OpenAI 兼容 Base URL。",
      localApiKeyRequired: "本地模式下必须填写 API key。",
      localModelRequired: "本地模式下必须填写模型名。",
      cloudApiBaseURLRequired: "云端模式下必须填写 API 地址。",
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
