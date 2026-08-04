import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeIntoPayload,
  parseIntakeCsv,
  parseIntakeJson,
  validateIntakeRows,
} from "../../scripts/lib/subprov-core-import.mjs";

const valid = {
  city: "大连市",
  region_code: "210200",
  year: "2025",
  metric_key: "gdp",
  compare_key: "GDP",
  unit: "亿元",
  value: "10,001.5",
  source_url: "https://stats.dl.gov.cn/example.html",
  source: "2025年大连市统计公报",
  responsible: "大连市统计局",
  doc_no: "",
  note: "测试记录",
};

test("CSV 解析支持 BOM、引号和逗号数值", () => {
  const csv = "\uFEFFcity,region_code,year,metric_key,compare_key,unit,value,source_url,source,responsible,doc_no,note\r\n"
    + '大连市,210200,2025,gdp,GDP,亿元,"10,001.5",https://stats.dl.gov.cn/example.html,统计公报,大连市统计局,,测试\r\n';
  const rows = parseIntakeCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, "10,001.5");
});

test("JSON 解析支持数组和 rows 包装", () => {
  assert.deepEqual(parseIntakeJson('[{"city":"大连市"}]'), [{ city: "大连市" }]);
  assert.deepEqual(parseIntakeJson('{"rows":[{"city":"大连市"}]}'), [{ city: "大连市" }]);
});

test("有效补录可转换为标准 additions 载荷", () => {
  const result = validateIntakeRows([valid]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.accepted[0].value, 10001.5);
  const payload = mergeIntoPayload(null, result.accepted);
  assert.equal(payload.kind, "subprov-stat-bulletin-series-v1");
  assert.equal(payload.records[0].metrics.gdp, 10001.5);
  assert.throws(() => mergeIntoPayload(payload, result.accepted), /已存在于目标补录文件/);
});

test("预检拒绝非政府来源、已发布单元和部分填写行", () => {
  const duplicate = new Set(["大连市|2025|GDP"]);
  const result = validateIntakeRows([
    { ...valid, source_url: "https://example.com/report" },
    { ...valid, metric_key: "gdp_per_capita", compare_key: "人均GDP", unit: "元", value: "" },
  ], duplicate);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /政府网站/);
  assert.match(result.errors[0], /已经发布/);
  assert.match(result.errors[1], /value/);
});

test("完全空白的台账行会被安全跳过", () => {
  const result = validateIntakeRows([{
    city: "大连市",
    region_code: "210200",
    year: "2025",
    metric_key: "gdp",
    compare_key: "GDP",
    unit: "亿元",
  }]);
  assert.equal(result.blank, 1);
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.errors, []);
});
