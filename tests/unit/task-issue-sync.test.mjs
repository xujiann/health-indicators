import assert from "node:assert/strict";
import test from "node:test";
import { buildIssuePlan, issueBody, issueTitle } from "../../scripts/lib/task-issue-sync.mjs";

const task = {
  id: "sp-2025-test",
  priority: "P0",
  city: "测试市",
  year: 2025,
  status: "pending",
  source_channels: [{ agency: "测试市统计局", topic: "统计公报", url: "https://example.gov.cn/a.html" }],
  missing_metrics: [{ compare_key: "GDP", unit: "亿元" }],
};
test("任务可生成 Issue 并在 imported 后关闭", () => {
  assert.equal(buildIssuePlan([task], [])[0].action, "create");
  const issue = { number: 1, title: "[数据补录] P0 测试市 2025", body: issueBody(task), state: "OPEN" };
  assert.equal(buildIssuePlan([{ ...task, status: "imported" }], [issue])[0].action, "close");
});

test("Issue 展示登记来源且不产生 undefined", () => {
  const body = issueBody(task);
  assert.match(body, /测试市统计局/);
  assert.match(body, /https:\/\/example\.gov\.cn\/a\.html/);
  assert.doesNotMatch(body, /undefined/);
});

test("已从缺口清单消失的托管 Issue 自动关闭", () => {
  const issue = { number: 2, title: issueTitle(task), body: issueBody(task), state: "OPEN" };
  const [item] = buildIssuePlan([], [issue]);
  assert.equal(item.action, "close");
  assert.equal(item.reason, "missing_from_current_tasks");
});

test("重新出现的缺口会重新打开已关闭 Issue", () => {
  const issue = { number: 3, title: issueTitle(task), body: issueBody(task), state: "CLOSED" };
  assert.equal(buildIssuePlan([task], [issue])[0].action, "reopen");
});
