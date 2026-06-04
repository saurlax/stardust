const trimSlash = (value: string) => value.replace(/\/+$/, "");

export const getApiBaseUrl = (override?: string) =>
  trimSlash(override?.trim() || "");

export const resolveApiBaseUrl = (override?: string) => {
  const resolvedBaseUrl = getApiBaseUrl(override);
  if (!resolvedBaseUrl) {
    throw new Error("API base URL is not configured");
  }

  return resolvedBaseUrl;
};

const resolveRequestUrl = (baseUrl: string, input: RequestInfo | URL) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : typeof input === "object" &&
          input !== null &&
          "url" in input &&
          typeof input.url === "string"
        ? input.url
        : String(input);

  if (/^https?:\/\//.test(rawUrl)) {
    return rawUrl;
  }

  return `${baseUrl}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
};

export const createApiFetch =
  (
    getBaseUrl: string | undefined | (() => string | undefined),
    fetchImpl: typeof fetch = fetch,
  ): typeof fetch =>
  async (input, init) => {
    const baseUrl =
      typeof getBaseUrl === "function" ? getBaseUrl() : getBaseUrl;
    const resolvedBaseUrl = resolveApiBaseUrl(baseUrl);
    return fetchImpl(resolveRequestUrl(resolvedBaseUrl, input), init);
  };

export const ping = async (baseUrl?: string) => {
  const response = await fetch(`${resolveApiBaseUrl(baseUrl)}/api/v1/ping`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return (await response.json()) as { message: string };
};
