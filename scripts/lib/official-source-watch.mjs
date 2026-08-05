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
