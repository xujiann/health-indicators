import assert from "node:assert/strict";
import test from "node:test";

await import("../../app-core.js");
const core = globalThis.HealthIndicatorsCore;

test("数值、层级和指标性质标准化", () => {
  assert.equal(core.numOf("1,234.50万人"), 1234.5);
  assert.equal(core.numOf("暂无"), null);
  assert.equal(core.tierNo("3·副省级城市"), 3);
  assert.equal(core.natKind("约束值"), "limit");
  assert.equal(core.natKind("指导性目标"), "target");
});

test("指标口径和来源部门识别", () => {
  assert.equal(core.metricForm({ nature: "实际值", indicator: "城镇化率", unit: "%" }), "rate");
  assert.equal(core.metricForm({ nature: "实际值", indicator: "总诊疗人次", unit: "亿人次" }), "service");
  assert.equal(core.metricForm({ nature: "目标值", indicator: "床位数", unit: "张" }), "target");
  assert.equal(core.sourceAgency({ source: "国家医疗保障局统计公报", source_url: "" }), "国家医保局");
  assert.equal(core.sourceAgency({ source: "南京市统计局", source_url: "" }), "地方部门");
});

test("查询支持短语、排除词和指标同义归并", () => {
  const record = {
    indicator: "地区生产总值（GDP）",
    compare_key: "GDP",
    category: "经济",
    subcategory: "经济总量",
    year: 2024,
    unit: "亿元",
    nature: "实际值",
    note: "",
    region: "大连市",
    source: "大连市统计公报",
    responsible: "",
    doc_no: "",
  };
  assert.equal(core.queryMatches(record, '"大连市" GDP'), true);
  assert.equal(core.queryMatches(record, "GDP -2023"), true);
  assert.equal(core.queryMatches(record, "GDP -2024"), false);
  assert.equal(core.indicatorFamily(record), "GDP");
});

test("来源状态区分原文、索引和待复核", () => {
  assert.equal(core.sourceStatus({ source_url: "https://example.gov.cn/a", note: "" }).cls, "link");
  assert.equal(core.sourceStatus({ source_url: "https://example.gov.cn", note: "公开来源索引（非单条原文）" }).cls, "index");
  assert.equal(core.sourceStatus({ source_url: "", note: "待正式来源复核" }).cls, "review");
});

test("唯一键稳定覆盖地区、年度、口径、性质和层级", () => {
  const record = {
    region_code: "210200",
    year: 2024,
    compare_key: "GDP",
    nature: "实际值",
    region_tier: "3·副省级城市",
  };
  assert.equal(core.recordKey(record), "210200|2024|GDP|实际值|3·副省级城市");
});
