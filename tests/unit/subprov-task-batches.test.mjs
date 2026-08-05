import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskBatches,
  findCompletedTaskIds,
  summarizeBatchImpact,
  updateTaskStatusPayload,
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

test("任务状态默认逐级推进并保留维护元数据", () => {
  const tasks = buildTaskBatches(gaps);
  const found = updateTaskStatusPayload(
    { schema_version: 1, tasks: {} },
    tasks,
    { taskId: "210200-2025", status: "found", assignee: "数据组", now: "2026-08-05T00:00:00.000Z" },
  ).payload;
  const reviewed = updateTaskStatusPayload(
    found,
    tasks,
    { taskId: "210200-2025", status: "reviewed", now: "2026-08-05T01:00:00.000Z" },
  ).payload;
  assert.equal(reviewed.tasks["210200-2025"].assignee, "数据组");
  assert.equal(reviewed.tasks["210200-2025"].status, "reviewed");
  assert.throws(
    () => updateTaskStatusPayload(
      { schema_version: 1, tasks: {} },
      tasks,
      { taskId: "210200-2025", status: "imported" },
    ),
    /按顺序推进/,
  );
});

test("只有覆盖全部剩余指标的补录才自动归档任务", () => {
  const tasks = buildTaskBatches(gaps);
  assert.deepEqual(
    findCompletedTaskIds([{ region_code: "210200", year: 2025 }], tasks),
    [],
  );
  assert.deepEqual(
    findCompletedTaskIds([
      { region_code: "210200", year: 2025 },
      { region_code: "210200", year: 2025 },
    ], tasks),
    ["210200-2025"],
  );
});
