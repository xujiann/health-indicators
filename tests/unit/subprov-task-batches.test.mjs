import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskBatches,
  summarizeBatchImpact,
  validateTaskStatuses,
} from "../../scripts/lib/subprov-task-batches.mjs";

const gaps = [
  { city: "大连市", region_code: "210200", year: 2025, metric_key: "gdp", compare_key: "GDP", unit: "亿元" },
  { city: "大连市", region_code: "210200", year: 2025, metric_key: "gdp_per_capita", compare_key: "人均GDP", unit: "元" },
];

test("缺口按城市和年度聚合为任务批次", () => {
  const tasks = buildTaskBatches(gaps, { schema_version: 1, tasks: { "210200-2025": { status: "found" } } });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].expected_impact, 2);
  assert.equal(tasks[0].status, "found");
  assert.equal(summarizeBatchImpact([{ region_code: "210200", year: 2025 }], tasks)[0].id, "210200-2025");
});

test("任务状态拒绝未知活动任务和非法状态", () => {
  const tasks = buildTaskBatches(gaps);
  const errors = validateTaskStatuses({
    schema_version: 1,
    tasks: { "x-2025": { status: "doing" } },
  }, tasks);
  assert.equal(errors.length, 2);
});
