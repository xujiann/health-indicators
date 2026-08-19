const RESTRICTED_HTTP_STATUSES = new Set([401, 403, 406, 412, 429]);
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

export function classifyHttpResponse(status, ok) {
  if (ok) return { status: "available", error_kind: "" };
  if (RESTRICTED_HTTP_STATUSES.has(status)) {
    return { status: "restricted", error_kind: "origin_access_restricted" };
  }
  if (TRANSIENT_HTTP_STATUSES.has(status)) {
    return { status: "indeterminate", error_kind: "transient_http" };
  }
  return { status: "unavailable", error_kind: "http_error" };
}

export function classifyFetchError(error) {
  const text = error instanceof Error ? error.message : String(error);
  const timeout = error?.name === "TimeoutError" || /timeout|aborted/i.test(text);
  return {
    status: "indeterminate",
    error_kind: timeout ? "timeout" : "network_error",
    error: text,
  };
}

export function isActionableSourceChange(change) {
  return change.kind !== "status" || ["unavailable", "restricted"].includes(change.current);
}

export async function fetchWithRetry(url, options = {}, policy = {}) {
  const attempts = policy.attempts || 3;
  const delays = policy.delays || [250, 1000, 3000];
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt === attempts - 1) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delays[Math.min(attempt, delays.length - 1)] || 0));
  }
  throw lastError;
}
