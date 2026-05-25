import { Platform } from "react-native";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const getDefaultApiBaseUrl = () => {
  if (Platform.OS === "android") return "http://10.0.2.2:8080";
  if (Platform.OS === "ios") return "http://127.0.0.1:8080";
  return "http://localhost:8080";
};

export const getApiBaseUrl = () =>
  trimSlash(process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || getDefaultApiBaseUrl());

export const ping = async (baseUrl?: string) => {
  const response = await fetch(`${trimSlash(baseUrl || getApiBaseUrl())}/api/v1/ping`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return (await response.json()) as { message: string };
};
