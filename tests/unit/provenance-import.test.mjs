import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeProvenanceOverrides,
  parseProvenanceCsv,
  parseProvenanceJson,
  validateProvenanceRows,
} from "../../scripts/lib/provenance-import.mjs";
import {
  applySourceOverride,
  publicizeSubprov,
} from "../../scripts/update-public-data.mjs";

const recordKey = "210200|2025|年末常住人口|实际值|3·副省级城市";
const record = {
  region_code: "210200",
  region: "大连市",
  year: 2025,
  compare_key: "年末常住人口",
  nature: "实际值",
  region_tier: "3·副省级城市",
  source_url: "https://www.dl.gov.cn/",
  note: "公开来源索引（非单条原文）；具体指标仍以该地区正式公开材料为准",
};
const valid = {
  record_key: recordKey,
  region: "大连市",
  year: "2025",
  compare_key: "年末常住人口",
  current_source_url: "https://www.dl.gov.cn/",
  source_url: "https://www.dl.gov.cn/art/2026/4/1/report.html",
  source: "2025年大连市国民经济和社会发展统计公报",
  responsible: "大连市统计局",
  doc_no: "",
  note: "年末口径",
};

test("来源台账 CSV 和 JSON 可稳定解析", () => {
  const csv = "\uFEFFrecord_key,region,year,compare_key,current_source_url,source_url,source,responsible,doc_no,note\n"
    + `"${recordKey}",大连市,2025,年末常住人口,https://www.dl.gov.cn/,https://www.dl.gov.cn/art/2026/4/1/report.html,统计公报,大连市统计局,,年末口径\n`;
  assert.equal(parseProvenanceCsv(csv)[0].record_key, recordKey);
  assert.deepEqual(parseProvenanceJson('[{"record_key":"x"}]'), [{ record_key: "x" }]);
  assert.deepEqual(parseProvenanceJson('{"rows":[{"record_key":"x"}]}'), [{ record_key: "x" }]);
});

test("有效原文证据可写入独立覆盖层", () => {
  const result = validateProvenanceRows([valid], new Map([[recordKey, record]]));
  assert.deepEqual(result.errors, []);
  assert.equal(result.accepted.length, 1);
  const payload = mergeProvenanceOverrides({ schema_version: 1, overrides: [] }, result.accepted);
  assert.equal(payload.overrides[0].source_url, valid.source_url);
  assert.throws(() => mergeProvenanceOverrides(payload, result.accepted), /已存在于来源证据覆盖文件/);
});

test("来源覆盖在索引兜底前应用并移除索引标记", () => {
  const raw = { ...record, source_url: "", note: "城市公开数据" };
  const applied = applySourceOverride(raw, {
    source_url: valid.source_url,
    source: valid.source,
    responsible: valid.responsible,
    doc_no: "—（公开原文）",
    note: "年末口径",
  });
  const published = publicizeSubprov(applied);
  assert.equal(published.source_url, valid.source_url);
  assert.match(published.note, /城市公开数据；年末口径/);
  assert.doesNotMatch(published.note, /公开来源索引/);
});

test("预检拒绝栏目入口、上下文漂移和非索引记录", () => {
  const direct = { ...record, note: "官方原文" };
  const result = validateProvenanceRows([
    { ...valid, source_url: "https://www.dl.gov.cn/" },
    { ...valid, year: "2024" },
    { ...valid, source_url: "https://example.com/report.html" },
  ], new Map([[recordKey, direct]]));
  assert.equal(result.accepted.length, 0);
  assert.equal(result.errors.length, 3);
  assert.match(result.errors[0], /不是来源索引|具体原文链接/);
  assert.match(result.errors[1], /year 应为/);
  assert.match(result.errors[2], /gov.cn/);
});

test("完全空白的原文替换行会被跳过", () => {
  const result = validateProvenanceRows([{
    record_key: recordKey,
    region: "大连市",
    year: "2025",
    compare_key: "年末常住人口",
    current_source_url: "https://www.dl.gov.cn/",
  }], new Map([[recordKey, record]]));
  assert.equal(result.blank, 1);
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.errors, []);
});
