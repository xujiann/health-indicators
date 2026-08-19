import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRecords, evidenceScore } from "../../scripts/lib/data-governance.mjs";

const record = { region_code: "000000", region: "全国", level: "国家", year: 2025, category: "卫生健康", subcategory: "卫生资源", indicator: "医院数", nature: "实际值", value: 100, unit: "个", yoy: "", deadline: "", responsible: "国家卫生健康委", source: "统计公报", doc_no: "", source_url: "https://www.nhc.gov.cn/a/b.html", note: "", compare_key: "医院数", region_tier: "1·全国" };

test("官方具体原文获得较高证据分", () => assert.ok(evidenceScore(record) >= 80));
test("治理规则识别百分比异常和跨来源冲突", () => {
  const bad = { ...record, value: 120, unit: "%", source_url: "https://example.com/a" };
  const conflict = { ...record, value: 101, source_url: "https://www.nhc.gov.cn/a/c.html" };
  const result = analyzeRecords([bad, conflict]);
  assert.equal(result.anomalies[0].rule, "percentage_range");
  assert.equal(result.conflicts.length, 1);
});
