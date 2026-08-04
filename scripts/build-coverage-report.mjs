import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOURCE_INDEX_NOTE,
  SUBPROV_CITIES,
  SUBPROV_CORE_METRICS,
  SUBPROV_YEARS,
} from "./lib/subprov-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataScriptPath = path.join(repoRoot, "public-data.js");
const jsonPath = path.join(repoRoot, "data", "coverage-report.json");
const csvPath = path.join(repoRoot, "data", "subprov-core-matrix-backlog.csv");
const markdownPath = path.join(repoRoot, "docs", "数据覆盖率报告.md");
const htmlPath = path.join(repoRoot, "coverage.html");
const checkOnly = process.argv.includes("--check");

const script = await fs.readFile(dataScriptPath, "utf8");
const match = script.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
if (!match) throw new Error("Unable to parse public-data.js");
const records = JSON.parse(match[1]);

const cities = SUBPROV_CITIES.map((city) => city.name);
const years = SUBPROV_YEARS;
const metricEntries = Object.entries(SUBPROV_CORE_METRICS);
const coreMetrics = metricEntries.map(([, metric]) => metric.compare_key);
const metricByCompareKey = new Map(metricEntries.map(([key, metric]) => [metric.compare_key, { key, ...metric }]));
const cityByName = new Map(SUBPROV_CITIES.map((city) => [city.name, city]));
const recordIds = new Set(records.map((record) => `${record.region}|${record.year}|${record.compare_key}`));

const cityRows = cities.map((city) => {
  let covered = 0;
  const byYear = {};
  for (const year of years) {
    const yearCovered = coreMetrics.filter((metric) => recordIds.has(`${city}|${year}|${metric}`)).length;
    byYear[year] = yearCovered;
    covered += yearCovered;
  }
  const cityRecords = records.filter((record) => record.region === city);
  const sourceIndexRows = cityRecords.filter((record) => String(record.note || "").includes(SOURCE_INDEX_NOTE)).length;
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
const sourceIndexRows = records.filter((record) => String(record.note || "").includes(SOURCE_INDEX_NOTE)).length;
const gaps = cities.flatMap((city) => years.flatMap((year) => coreMetrics
  .filter((metric) => !recordIds.has(`${city}|${year}|${metric}`))
  .map((compareKey) => {
    const metric = metricByCompareKey.get(compareKey);
    return {
      city,
      region_code: cityByName.get(city).code,
      year,
      metric_key: metric.key,
      compare_key: compareKey,
      unit: metric.unit,
    };
  })));
const sourceIndexGroups = Object.values(records
  .filter((record) => String(record.note || "").includes(SOURCE_INDEX_NOTE))
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
  schema_version: 2,
  definition: { cities, years, core_metrics: coreMetrics },
  summary: {
    rows: records.length,
    matrix_covered: totalCovered,
    matrix_expected: totalExpected,
    matrix_gaps: gaps.length,
    matrix_completeness: Number((totalCovered / totalExpected * 100).toFixed(1)),
    direct_source_rows: records.length - sourceIndexRows,
    source_index_rows: sourceIndexRows,
  },
  cities: cityRows,
  gaps,
  source_index_groups: sourceIndexGroups,
};

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const backlogHeaders = [
  "city", "region_code", "year", "metric_key", "compare_key", "unit",
  "value", "source_url", "source", "responsible", "doc_no", "note",
];
const backlog = `\uFEFF${[
  backlogHeaders,
  ...gaps.map((gap) => backlogHeaders.map((header) => gap[header] ?? "")),
].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

const tableRows = cityRows.map((row) => (
  `| ${row.city} | ${years.map((year) => row.by_year[year]).join(" | ")} | ${row.covered}/${row.expected} | ${row.completeness}% | ${row.direct_source_rows} | ${row.source_index_rows} |`
)).join("\n");
const markdown = `# 数据覆盖率报告

本报告由 \`public-data.js\` 确定性生成，用于跟踪 15 个副省级城市 2020—2025 年核心经济、人口和财政指标矩阵。核心指标包括 GDP、人均 GDP、常住人口、户籍人口、城镇化率、一般公共预算收入和一般公共预算支出。

## 总览

- 当前公开记录：${records.length} 条
- 核心矩阵覆盖：${totalCovered}/${totalExpected}，完整率 ${report.summary.matrix_completeness}%
- 待补录单元：${gaps.length} 个
- 单条或明确原文记录：${report.summary.direct_source_rows} 条
- 仅来源索引记录：${sourceIndexRows} 条

## 城市覆盖

| 城市 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 合计 | 完整率 | 原文记录 | 来源索引 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows}

## 补录入口

1. 在 \`data/subprov-core-matrix-backlog.csv\` 中填写待补录行的 \`value\`、\`source_url\` 和 \`responsible\`；可按需填写来源标题、文号和备注。
2. 运行 \`npm run import:subprov -- <补录文件.csv>\` 进行只读预检。
3. 复核通过后运行 \`npm run import:subprov -- <补录文件.csv> --write\` 写入事实源，再执行 \`npm run build:data && npm test\`。
4. 完整规则见 \`docs/城市核心指标补录工作流.md\`，可视化维护页见 \`coverage.html\`。

## 维护规则

1. 新增记录必须进入 \`data/base-public-records.json\` 或匹配 \`data/*-additions.json\` 的来源文件。
2. 只有同一城市、年度和 \`compare_key\` 同时存在时，才计为一个已覆盖单元。
3. “来源索引”只表示地区官方公开入口；找到统计公报单条原文后，应替换链接并移除相应索引备注。
4. 执行 \`npm run build:data\` 会同步刷新 JSON、Markdown、补录台账和维护页面；CI 使用 \`npm run verify:generated\` 阻止生成物漂移。
`;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const cityTableHtml = cityRows.map((row) => `<tr>
  <th scope="row">${escapeHtml(row.city)}</th>
  ${years.map((year) => `<td data-count="${row.by_year[year]}">${row.by_year[year]}/7</td>`).join("")}
  <td><strong>${row.covered}/${row.expected}</strong></td>
  <td>${row.completeness}%</td>
</tr>`).join("\n");
const reportJson = JSON.stringify(report).replaceAll("<", "\\u003c");
const coverageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>数据覆盖维护 · 卫生健康指标库</title>
<style>
:root{--ink:#17202e;--muted:#667085;--line:#dce3ec;--bg:#f4f6f9;--panel:#fff;--brand:#1f4e79;--soft:#eaf1f7;--warn:#a85c00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei","PingFang SC",sans-serif;line-height:1.55}
.wrap{width:min(1180px,100%);margin:auto;padding:18px}.nav{display:flex;gap:8px;justify-content:flex-end;margin-bottom:14px}.nav a,.button{display:inline-flex;align-items:center;min-height:38px;padding:0 13px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--brand);font-weight:700;text-decoration:none}
.hero,.panel,.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(20,40,70,.05)}.hero{padding:24px}.hero h1{margin:4px 0 7px;font-size:29px}.hero p,.muted{color:var(--muted)}.hero p{margin:0}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.kpi{padding:16px}.kpi b{display:block;font-size:27px;color:var(--brand)}.kpi span{font-size:13px;color:var(--muted)}
.panel{padding:18px;margin-top:12px}.panel h2{font-size:18px;margin:0 0 12px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}th,td{text-align:left;border-bottom:1px solid #e8edf3;padding:9px}thead th{background:#f6f8fb;color:#475467}td[data-count="0"]{color:#b42318;background:#fff4f2}td[data-count="7"]{color:#067647;background:#ecfdf3}
.filters{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:9px;margin-bottom:12px}label{font-size:12px;color:var(--muted)}select,input{display:block;width:100%;margin-top:4px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:9px;font:14px inherit;color:var(--ink)}
.gap-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}.gap{border:1px solid var(--line);border-radius:7px;padding:10px;background:#fff}.gap b{display:block;font-size:13px}.gap span{font-size:12px;color:var(--muted)}.toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}.source-list{display:grid;gap:8px}.source{border-left:3px solid var(--warn);padding:8px 11px;background:#fffaf3}.source a{color:var(--brand);word-break:break-all}.empty{padding:24px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:7px}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr}.hero h1{font-size:24px}.nav{justify-content:flex-start;overflow:auto}.wrap{padding:12px}}
</style>
</head>
<body>
<main class="wrap">
  <nav class="nav" aria-label="项目导航"><a href="index.html">数据首页</a><a href="about.html">关于</a></nav>
  <section class="hero"><div class="muted">DATA MAINTENANCE</div><h1>副省级城市核心指标覆盖维护</h1><p>用同一张矩阵查看覆盖情况、筛选待补单元并下载标准台账。所有数值仍须经过官方原文校验后才能入库。</p></section>
  <section class="kpis" aria-label="覆盖概览">
    <div class="kpi"><b>${totalCovered}/${totalExpected}</b><span>核心矩阵覆盖</span></div>
    <div class="kpi"><b>${report.summary.matrix_completeness}%</b><span>矩阵完整率</span></div>
    <div class="kpi"><b id="gapKpi">${gaps.length}</b><span>待补录单元</span></div>
    <div class="kpi"><b>${sourceIndexRows}</b><span>仅来源索引记录</span></div>
  </section>
  <section class="panel"><h2>城市 × 年度覆盖矩阵</h2><div class="scroll"><table><thead><tr><th>城市</th>${years.map((year) => `<th>${year}</th>`).join("")}<th>合计</th><th>完整率</th></tr></thead><tbody>${cityTableHtml}</tbody></table></div><p class="muted">单元格为该城市该年度已收录核心指标数，满格为 7/7。</p></section>
  <section class="panel">
    <div class="toolbar"><h2>待补录单元</h2><a class="button" href="data/subprov-core-matrix-backlog.csv" download>下载标准补录台账</a></div>
    <div class="filters">
      <label>城市<select id="cityFilter"><option value="">全部城市</option>${cities.map((city) => `<option>${escapeHtml(city)}</option>`).join("")}</select></label>
      <label>年度<select id="yearFilter"><option value="">全部年度</option>${years.map((year) => `<option>${year}</option>`).join("")}</select></label>
      <label>指标<select id="metricFilter"><option value="">全部指标</option>${coreMetrics.map((metric) => `<option>${escapeHtml(metric)}</option>`).join("")}</select></label>
    </div>
    <div class="toolbar"><span id="gapCount" aria-live="polite"></span><a href="docs/城市核心指标补录工作流.md">查看补录工作流</a></div>
    <div class="gap-list" id="gapList"></div>
  </section>
  <section class="panel"><h2>待替换的来源索引</h2><p class="muted">这些记录指向官方栏目入口，不是单条统计原文；应优先找到并替换为对应公报原文。</p><div class="source-list" id="sourceList"></div></section>
</main>
<script type="application/json" id="coverageData">${reportJson}</script>
<script>
const report=JSON.parse(document.querySelector("#coverageData").textContent);
const city=document.querySelector("#cityFilter"),year=document.querySelector("#yearFilter"),metric=document.querySelector("#metricFilter");
const gapList=document.querySelector("#gapList"),gapCount=document.querySelector("#gapCount");
function esc(value){const span=document.createElement("span");span.textContent=value;return span.innerHTML}
function drawGaps(){
  const rows=report.gaps.filter(row=>(!city.value||row.city===city.value)&&(!year.value||String(row.year)===year.value)&&(!metric.value||row.compare_key===metric.value));
  gapCount.textContent="当前筛选 "+rows.length+" 个缺口";
  gapList.innerHTML=rows.length?rows.slice(0,120).map(row=>'<div class="gap"><b>'+esc(row.city)+' · '+row.year+'</b><span>'+esc(row.compare_key)+'（'+esc(row.unit)+'）</span></div>').join(""):'<div class="empty">当前条件下没有缺口</div>';
  if(rows.length>120)gapList.insertAdjacentHTML("beforeend",'<div class="empty">另有 '+(rows.length-120)+' 个结果，请继续筛选或下载完整台账。</div>');
}
[city,year,metric].forEach(control=>control.addEventListener("change",drawGaps));
document.querySelector("#sourceList").innerHTML=report.source_index_groups.length?report.source_index_groups.map(group=>'<div class="source"><b>'+esc(group.region)+' · '+group.rows+' 条</b><div class="muted">'+group.years.join("、")+' · '+group.compare_keys.map(esc).join("、")+'</div><a target="_blank" rel="noopener" href="'+esc(group.source_url)+'">'+esc(group.source_url)+'</a></div>').join(""):'<div class="empty">没有待替换的来源索引</div>';
drawGaps();
</script>
</body>
</html>
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
await writeOrCheck(csvPath, backlog);
await writeOrCheck(markdownPath, markdown);
await writeOrCheck(htmlPath, coverageHtml);
console.log(JSON.stringify(report.summary, null, 2));
