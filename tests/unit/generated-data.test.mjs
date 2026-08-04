import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const script = await fs.readFile(new URL("../../public-data.js", import.meta.url), "utf8");
const match = script.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
assert.ok(match, "public-data.js should contain a generated data array");
const records = JSON.parse(match[1]);

test("生成数据保持19字段和唯一键", async () => {
  await import("../../app-core.js");
  const { recordKey } = globalThis.HealthIndicatorsCore;
  const expectedFields = [
    "region_code", "region", "level", "year", "category", "subcategory",
    "indicator", "nature", "value", "unit", "yoy", "deadline",
    "responsible", "source", "doc_no", "source_url", "note", "compare_key",
    "region_tier",
  ];
  assert.equal(records.length, 2701);
  assert.deepEqual(Object.keys(records[0]), expectedFields);
  assert.equal(new Set(records.map(recordKey)).size, records.length);
});

test("所有发布记录均有来源且不存在内部标记", () => {
  assert.equal(records.filter((record) => !String(record.source_url || "").trim()).length, 0);
  assert.equal(records.filter((record) => /内部资料|仅限内部使用|内部文件/.test(
    `${record.source || ""} ${record.doc_no || ""} ${record.note || ""}`,
  )).length, 0);
});
