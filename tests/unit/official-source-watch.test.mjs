import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFetchError,
  classifyHttpResponse,
  fetchWithRetry,
  isActionableSourceChange,
} from "../../scripts/lib/official-source-watch.mjs";

test("来源巡检区分可用、受限、失效和瞬时错误", () => {
  assert.equal(classifyHttpResponse(200, true).status, "available");
  assert.equal(classifyHttpResponse(412, false).status, "restricted");
  assert.equal(classifyHttpResponse(404, false).status, "unavailable");
  assert.equal(classifyHttpResponse(503, false).status, "indeterminate");
});

test("网络失败不会被误判为来源失效", () => {
  assert.deepEqual(classifyFetchError(new Error("fetch failed")), {
    status: "indeterminate",
    error_kind: "network_error",
    error: "fetch failed",
  });
});

test("网络不确定变化不会触发待复核 Issue", () => {
  assert.equal(isActionableSourceChange({ kind: "status", current: "indeterminate" }), false);
  assert.equal(isActionableSourceChange({ kind: "status", current: "unavailable" }), true);
  assert.equal(isActionableSourceChange({ kind: "content", current: "new" }), true);
});

test("瞬时 HTTP 失败会重试并恢复", async () => {
  const original = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => ({ status: ++attempts === 1 ? 503 : 200 });
  try {
    const response = await fetchWithRetry("https://example.gov.cn/a", {}, { attempts: 2, delays: [0] });
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = original;
  }
});
