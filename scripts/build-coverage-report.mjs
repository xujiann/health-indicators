import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataScriptPath = path.join(repoRoot, "public-data.js");
const jsonPath = path.join(repoRoot, "data", "coverage-report.json");
const markdownPath = path.join(repoRoot, "docs", "数据覆盖率报告.md");
const checkOnly = process.argv.includes("--check");

const script = await fs.readFile(dataScriptPath, "utf8");
const match = script.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
if (!match) throw new Error("Unable to parse public-data.js");
const records = JSON.parse(match[1]);

const cities = [
  "大连市", "成都市", "广州市", "哈尔滨市", "杭州市",
  "济南市", "南京市", "宁波市", "青岛市", "厦门市",
  "深圳市", "沈阳市", "武汉市", "西安市", "长春市",
];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const coreMetrics = [
  "GDP",
  "人均GDP",
  "年末常住人口",
  "年末户籍人口",
  "城镇化率(常住)",
  "地方一般公共预算收入",
  "地方一般公共预算支出",
];
const recordIds = new Set(records.map((record) => `${record.region}|${record.year}|${record.compare_key}`));
const sourceIndexText = "公开来源索引（非单条原文）";

const cityRows = cities.map((city) => {
  let covered = 0;
  const byYear = {};
  for (const year of years) {
    const yearCovered = coreMetrics.filter((metric) => recordIds.has(`${city}|${year}|${metric}`)).length;
    byYear[year] = yearCovered;
    covered += yearCovered;
  }
  const cityRecords = records.filter((record) => record.region === city);
  const sourceIndexRows = cityRecords.filter((record) => String(record.note || "").includes(sourceIndexText)).length;
  return {
    city,
    covered,
    expected: years.length * coreMetrics.length,
    completeness: Number((covered / (years.length * coreMetrics.length) * 100).toFixed(1)),
    by_year: byYear,
    records: cityRecords.length,
    direct_source_rows: cityRecords.length - sourceIndexRows,
    source_index_rows: sourceIndexRows,
  };
});

const totalExpected = cities.length * years.length * coreMetrics.length;
const totalCovered = cityRows.reduce((sum, row) => sum + row.covered, 0);
const sourceIndexRows = records.filter((record) => String(record.note || "").includes(sourceIndexText)).length;
const gaps = cities.flatMap((city) => years.flatMap((year) => coreMetrics
  .filter((metric) => !recordIds.has(`${city}|${year}|${metric}`))
  .map((metric) => ({ city, year, compare_key: metric }))));
const sourceIndexGroups = Object.values(records
  .filter((record) => String(record.note || "").includes(sourceIndexText))
  .reduce((groups, record) => {
    const key = `${record.region}|${record.source_url}`;
    const group = groups[key] || {
      region: record.region,
      source_url: record.source_url,
      rows: 0,
      years: new Set(),
      compare_keys: new Set(),
    };
    group.rows += 1;
    group.years.add(record.year);
    group.compare_keys.add(record.compare_key);
    groups[key] = group;
    return groups;
  }, {}))
  .map((group) => ({
    region: group.region,
    source_url: group.source_url,
    rows: group.rows,
    years: [...group.years].sort(),
    compare_keys: [...group.compare_keys].sort((a, b) => a.localeCompare(b, "zh-Hans")),
  }))
  .sort((a, b) => b.rows - a.rows || a.region.localeCompare(b.region, "zh-Hans"));
const report = {
  schema_version: 1,
  definition: {
    cities,
    years,
    core_metrics: coreMetrics,
  },
  summary: {
    rows: records.length,
    matrix_covered: totalCovered,
    matrix_expected: totalExpected,
    matrix_completeness: Number((totalCovered / totalExpected * 100).toFixed(1)),
    direct_source_rows: records.length - sourceIndexRows,
    source_index_rows: sourceIndexRows,
  },
  cities: cityRows,
  gaps,
  source_index_groups: sourceIndexGroups,
};

const tableRows = cityRows.map((row) => (
  `| ${row.city} | ${years.map((year) => row.by_year[year]).join(" | ")} | ${row.covered}/${row.expected} | ${row.completeness}% | ${row.direct_source_rows} | ${row.source_index_rows} |`
)).join("\n");
const markdown = `# 数据覆盖率报告

本报告由 \`public-data.js\` 确定性生成，用于跟踪 15 个副省级城市 2020—2025 年核心经济、人口和财政指标矩阵。核心指标包括 GDP、人均 GDP、常住人口、户籍人口、城镇化率、一般公共预算收入和一般公共预算支出。

## 总览

- 当前公开记录：${records.length} 条
- 核心矩阵覆盖：${totalCovered}/${totalExpected}，完整率 ${report.summary.matrix_completeness}%
- 单条或明确原文记录：${report.summary.direct_source_rows} 条
- 仅来源索引记录：${sourceIndexRows} 条

## 城市覆盖

| 城市 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 合计 | 完整率 | 原文记录 | 来源索引 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows}

## 维护规则

1. 新增记录必须进入 \`data/base-public-records.json\` 或匹配 \`data/*-additions.json\` 的来源文件。
2. 只有同一城市、年度和 \`compare_key\` 同时存在时，才计为一个已覆盖单元。
3. “来源索引”只表示地区官方公开入口；找到统计公报单条原文后，应替换链接并移除相应索引备注。
4. 执行 \`npm run build:data\` 会同步刷新本报告；CI 使用 \`npm run verify:generated\` 阻止生成物漂移。
`;

async function writeOrCheck(filePath, content) {
  let current = "";
  try {
    current = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current === content) return;
  if (checkOnly) throw new Error(`Generated file is stale: ${path.relative(repoRoot, filePath)}`);
  await fs.writeFile(filePath, content, "utf8");
}

await writeOrCheck(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
await writeOrCheck(markdownPath, markdown);
console.log(JSON.stringify(report.summary, null, 2));
