const PLACEHOLDER_PATTERNS = [
  /paste-your-google-ai-studio/i,
  /your[-_ ]?api[-_ ]?key/i,
  /replace[-_ ]?me/i,
];

export function getGeminiApiKeys(env = process.env) {
  const configuredKeys = [env.GEMINI_API_KEY];
  const numberedKeys = Object.keys(env)
    .filter((name) => /^GEMINI_API_KEY_\d+$/.test(name))
    .sort((left, right) => Number(left.slice(left.lastIndexOf("_") + 1)) - Number(right.slice(right.lastIndexOf("_") + 1)));
  for (const name of numberedKeys) configuredKeys.push(env[name]);

  return [...new Set(configuredKeys
    .map((key) => key?.trim())
    .filter((key) => key && !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(key))))];
}

async function shouldRetryWithNextKey(response) {
  const { status } = response;
  if (status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) {
    return true;
  }
  if (status !== 400) {
    return false;
  }

  const body = await response.clone().json().catch(() => null);
  const message = body?.error?.message || body?.message || "";
  return /(?:api[\s_-]*key.*(?:invalid|not valid|expired|disabled)|(?:invalid|expired|disabled).*api[\s_-]*key)/i.test(message);
}

export async function fetchWithGeminiKeyFallback({
  apiKeys,
  url,
  init = {},
  timeoutMs,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    throw new Error("Chưa có GEMINI_API_KEY hợp lệ.");
  }

  let lastResponse;
  let lastError;
  for (const [index, apiKey] of apiKeys.entries()) {
    const headers = new Headers(init.headers);
    headers.set("x-goog-api-key", apiKey);

    try {
      const attemptInit = timeoutMs
        ? { ...init, headers, signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs) }
        : { ...init, headers, ...(signal ? { signal } : {}) };
      const response = await fetchImpl(url, attemptInit);
      if (response.ok || !(await shouldRetryWithNextKey(response)) || index === apiKeys.length - 1) {
        return { response, keyNumber: index + 1, attempts: index + 1 };
      }
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (index === apiKeys.length - 1) {
        throw error;
      }
    }
  }

  if (lastResponse) {
    return { response: lastResponse, keyNumber: apiKeys.length, attempts: apiKeys.length };
  }
  throw lastError || new Error("Gemini không khả dụng với các key đã cấu hình.");
}
