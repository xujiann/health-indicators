import assert from "node:assert/strict";
import test from "node:test";
import { buildIssuePlan, issueBody } from "../../scripts/lib/task-issue-sync.mjs";

const task = { id: "sp-2025-test", priority: "P0", city: "测试市", year: 2025, status: "pending", source_url: "https://example.gov.cn/a.html", missing_metrics: [{ compare_key: "GDP", unit: "亿元" }] };
test("任务可生成 Issue 并在 imported 后关闭", () => {
  assert.equal(buildIssuePlan([task], [])[0].action, "create");
  const issue = { number: 1, title: "[数据补录] P0 测试市 2025", body: issueBody(task), state: "OPEN" };
  assert.equal(buildIssuePlan([{ ...task, status: "imported" }], [issue])[0].action, "close");
});
