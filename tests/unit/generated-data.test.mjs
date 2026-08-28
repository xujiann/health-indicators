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
  const manifest = JSON.parse(await fs.readFile(
    new URL("../../data/public-data-manifest.json", import.meta.url),
    "utf8",
  ));
  assert.equal(records.length, manifest.rows);
  assert.deepEqual(Object.keys(records[0]), expectedFields);
  assert.equal(new Set(records.map(recordKey)).size, records.length);
});

test("副省级城市核心矩阵没有未处置缺口且公开包不含来源索引", async () => {
  const report = JSON.parse(await fs.readFile(
    new URL("../../data/coverage-report.json", import.meta.url),
    "utf8",
  ));
  const covered = report.cities.reduce((total, city) => (
    total + [2023, 2024, 2025].reduce((sum, year) => sum + (city.by_year[year] || 0), 0)
  ), 0);
  const expected = 15 * 3 * 7;
  assert.equal(report.schema_version, 5);
  assert.ok(covered >= 276);
  assert.equal(expected, 315);
  assert.equal(report.summary.recent_matrix_covered, covered);
  assert.equal(report.summary.recent_matrix_expected, expected);
  assert.ok(report.summary.recent_matrix_completeness >= 87.5);
  assert.ok(covered / expected >= 0.875);
  assert.equal(report.summary.source_index_rows, 0);
  assert.equal(report.summary.unresolved_matrix_gaps, 0);
  assert.equal(report.summary.matrix_resolution_rate, 100);
  assert.equal(report.gaps.length, 0);
  assert.equal(
    report.summary.matrix_covered + report.summary.resolved_exception_cells,
    report.summary.matrix_expected,
  );
});

test("数据治理门禁保持零错误且治理字段100%完整", async () => {
  const report = JSON.parse(await fs.readFile(
    new URL("../../data/data-quality-report.json", import.meta.url),
    "utf8",
  ));
  assert.equal(report.summary.schema_errors, 0);
  assert.equal(report.summary.anomalies, 0);
  assert.equal(report.summary.conflicts, 0);
  assert.equal(report.summary.source_complete, records.length);
});

test("所有发布记录均有来源且不存在内部标记", () => {
  assert.equal(records.filter((record) => !String(record.source_url || "").trim()).length, 0);
  assert.equal(records.filter((record) => /内部资料|仅限内部使用|内部文件/.test(
    `${record.source || ""} ${record.doc_no || ""} ${record.note || ""}`,
  )).length, 0);
  assert.equal(records.filter((record) => String(record.note || "").includes(
    "公开来源索引（非单条原文）",
  )).length, 0);
});

test("2025年国家卫健委统计公报已形成完整专题包", async () => {
  const source = "2025年我国卫生健康事业发展统计公报";
  const rows = records.filter((record) => record.source === source);
  assert.ok(rows.length >= 290);
  assert.equal(new Set(rows.map((record) => record.subcategory)).size, 12);
  const values = new Map(rows.map((record) => [record.compare_key, Number(record.value)]));
  assert.equal(values.get("医疗卫生机构总数"), 1108335);
  assert.equal(values.get("卫生技术人员数"), 1345.5);
  assert.equal(values.get("总诊疗人次"), 106.5);
  assert.equal(values.get("人均预期寿命"), 79.25);
  assert.equal(values.get("孕产妇死亡率(合计)"), 13.4);
  assert.equal(values.get("婴儿死亡率(合计)"), 3.8);
  assert.ok(rows.every((record) => String(record.source_url).includes("1b45959033524f48867d90e822be5394")));

  const topicPack = JSON.parse(await fs.readFile(
    new URL("../../data/packs/national-health-2025.json", import.meta.url),
    "utf8",
  ));
  assert.equal(topicPack.name, "national-health-2025");
  assert.equal(topicPack.rows.length, rows.length);
});
