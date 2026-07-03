import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const privateRoot = path.resolve(repoRoot, "..", "health-indicators-private");
const additionsDir = path.join(repoRoot, "data");

const nationalHealthMetricDefinitions = {
  total_institutions: { subcategory: "卫生资源", indicator: "医疗卫生机构总数", compare_key: "医疗卫生机构总数", unit: "个" },
  hospitals: { subcategory: "卫生资源", indicator: "医院数", compare_key: "医院数", unit: "个" },
  beds: { subcategory: "卫生资源", indicator: "医疗卫生机构实有床位数", compare_key: "医疗卫生机构实有床位数", unit: "万张" },
  beds_per_1000: { subcategory: "卫生资源", indicator: "每千人口医疗卫生机构床位数", compare_key: "每千人口医疗卫生机构床位数", unit: "张" },
  health_workers: { subcategory: "卫生人员", indicator: "卫生人员总数", compare_key: "卫生人员总数", unit: "万人" },
  health_technicians: { subcategory: "卫生人员", indicator: "卫生技术人员数", compare_key: "卫生技术人员数", unit: "万人" },
  physicians_assistants: { subcategory: "卫生人员", indicator: "执业(助理)医师数", compare_key: "执业(助理)医师数", unit: "万人" },
  registered_nurses: { subcategory: "卫生人员", indicator: "注册护士数", compare_key: "注册护士数", unit: "万人" },
  physicians_per_1000: { subcategory: "卫生人员", indicator: "每千人口执业(助理)医师数", compare_key: "每千人口执业(助理)医师数", unit: "人" },
  nurses_per_1000: { subcategory: "卫生人员", indicator: "每千人口注册护士数", compare_key: "每千人口注册护士数", unit: "人" },
  general_practitioners_per_10000: { subcategory: "卫生人员", indicator: "每万人口全科医生数", compare_key: "每万人口全科医生数", unit: "人" },
  total_visits: { subcategory: "医疗服务", indicator: "总诊疗人次", compare_key: "总诊疗人次", unit: "亿人次" },
  admissions: { subcategory: "医疗服务", indicator: "入院人次", compare_key: "入院人次", unit: "万人次" },
  total_health_expenditure: { subcategory: "卫生费用", indicator: "卫生总费用", compare_key: "卫生总费用", unit: "亿元" },
  health_expenditure_per_capita: { subcategory: "卫生费用", indicator: "人均卫生总费用", compare_key: "人均卫生总费用", unit: "元" },
};

const subprovStatMetricDefinitions = {
  gdp: { category: "经济", subcategory: "经济总量", indicator: "地区生产总值（GDP）", compare_key: "GDP", unit: "亿元" },
  gdp_per_capita: { category: "经济", subcategory: "经济总量", indicator: "人均GDP", compare_key: "人均GDP", unit: "元" },
  resident_population: { category: "人口", subcategory: "人口规模与结构", indicator: "年末常住人口", compare_key: "年末常住人口", unit: "万人" },
  registered_population: { category: "人口", subcategory: "人口规模与结构", indicator: "年末户籍人口", compare_key: "年末户籍人口", unit: "万人" },
  urbanization_rate: { category: "人口", subcategory: "人口规模与结构", indicator: "城镇化率(常住)", compare_key: "城镇化率(常住)", unit: "%" },
  local_public_budget_revenue: { category: "财政", subcategory: "财政收支", indicator: "地方一般公共预算收入", compare_key: "地方一般公共预算收入", unit: "亿元" },
  local_public_budget_expenditure: { category: "财政", subcategory: "财政收支", indicator: "地方一般公共预算支出", compare_key: "地方一般公共预算支出", unit: "亿元" },
};

async function firstXlsx(dir) {
  const files = await fs.readdir(dir);
  const found = files.find((name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"));
  if (!found) throw new Error(`No xlsx found in ${dir}`);
  return path.join(dir, found);
}

async function readWorkbookRows(xlsxPath) {
  const input = await FileBlob.load(xlsxPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheetInfos = (await workbook.inspect({
    kind: "sheet",
    include: "name",
    maxChars: 4000,
  })).ndjson.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const preferred = sheetInfos.find((s) => /指标数据|公开指标数据/.test(s.name)) || sheetInfos[sheetInfos.length - 1];
  const sheet = workbook.worksheets.getItem(preferred.name);
  const used = sheet.getUsedRange(true);
  return used.values.filter((row) => row.some((cell) => cell !== null && cell !== ""));
}

function rowObjects(matrix) {
  const headers = matrix[0];
  return matrix.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
}

function normalizeRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value == null ? "" : value]));
}

function expandNationalHealthSeries(payload) {
  return payload.years.flatMap((entry) => Object.entries(entry.metrics).map(([metricKey, value]) => {
    const definition = nationalHealthMetricDefinitions[metricKey];
    if (!definition) throw new Error(`Unknown national health metric: ${metricKey}`);
    return normalizeRecord({
      region_code: "000000",
      region: "全国",
      level: "国家",
      year: entry.year,
      category: "卫生健康",
      subcategory: definition.subcategory,
      indicator: definition.indicator,
      nature: "实际值",
      value,
      unit: definition.unit,
      yoy: "",
      deadline: "",
      responsible: "国家卫生健康委",
      source: `${entry.year}年我国卫生健康事业发展统计公报`,
      doc_no: "—（公开统计公报）",
      source_url: entry.source_url,
      note: payload.note || "国家卫健委统计公报补录",
      compare_key: definition.compare_key,
      region_tier: "1·全国",
    });
  }));
}

function expandSubprovStatBulletinSeries(payload) {
  return payload.records.flatMap((entry) => Object.entries(entry.metrics).map(([metricKey, value]) => {
    const definition = subprovStatMetricDefinitions[metricKey];
    if (!definition) throw new Error(`Unknown subprov stat metric: ${metricKey}`);
    return normalizeRecord({
      region_code: entry.region_code,
      region: entry.region,
      level: "市",
      year: entry.year,
      category: definition.category,
      subcategory: definition.subcategory,
      indicator: entry.indicator_overrides?.[metricKey] || definition.indicator,
      nature: "实际值",
      value,
      unit: definition.unit,
      yoy: entry.yoy?.[metricKey] || "",
      deadline: "",
      responsible: entry.responsible || "",
      source: `${entry.year}年${entry.region}国民经济和社会发展统计公报`,
      doc_no: "—（公开统计公报）",
      source_url: entry.source_url,
      note: [payload.note, entry.note, entry.metric_notes?.[metricKey]].filter(Boolean).join("；"),
      compare_key: definition.compare_key,
      region_tier: "3·副省级城市",
    });
  }));
}

function sortRecord(a, b) {
  const tier = String(a.region_tier).localeCompare(String(b.region_tier), "zh-Hans");
  if (tier) return tier;
  const cat = String(a.category).localeCompare(String(b.category), "zh-Hans");
  if (cat) return cat;
  const key = String(a.compare_key).localeCompare(String(b.compare_key), "zh-Hans");
  if (key) return key;
  const region = String(a.region).localeCompare(String(b.region), "zh-Hans");
  if (region) return region;
  return Number(a.year || 0) - Number(b.year || 0);
}

function isPublishableSubprov(record) {
  const text = `${record.category || ""} ${record.source || ""} ${record.indicator || ""}`;
  if (/医药卫生体制改革|重点工作任务|征求意见稿|十五五规划|疾控规划|卫健规划/.test(text)) return false;
  return String(record.region_tier || "").startsWith("3");
}

function publicizeSubprov(record) {
  const next = { ...record };
  const restrictionText = `${next.doc_no || ""} ${next.source_url || ""}`;
  if (/内部资料|仅限内部使用|内部文件|注意保存/.test(restrictionText)) {
    next.doc_no = "—（经确认可公开）";
    next.source_url = "";
  }
  return next;
}

async function loadAdditions() {
  try {
    const files = (await fs.readdir(additionsDir)).filter((name) => name.endsWith("-additions.json")).sort();
    const additions = [];
    for (const file of files) {
      const payload = JSON.parse(await fs.readFile(path.join(additionsDir, file), "utf8"));
      if (Array.isArray(payload)) {
        additions.push(...payload.map(normalizeRecord));
      } else if (payload.kind === "national-health-series-v1") {
        additions.push(...expandNationalHealthSeries(payload));
      } else if (payload.kind === "subprov-stat-bulletin-series-v1") {
        additions.push(...expandSubprovStatBulletinSeries(payload));
      } else {
        throw new Error(`Unsupported additions payload in ${file}`);
      }
    }
    return additions;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function recordKey(record) {
  return [
    record.region_code,
    record.year,
    record.compare_key,
    record.nature,
    record.region_tier,
  ].join("|");
}

async function buildWorkbook(headers, records, outputPath) {
  const workbook = Workbook.create();
  const note = workbook.worksheets.add("说明");
  note.getRange("A1").values = [["国家·辽宁·大连 公开指标数据库"]];
  note.getRange("A3").values = [[`本表仅含公开发布及经确认可公开的指标数据，共${records.length}条，不含未公开规划文件。`]];
  note.getRange("A4").values = [["本版纳入全国近十年卫生健康统计公报核心序列及15个副省级城市公开对标数据；引用请以原始公报或正式来源为准。"]];
  note.getRange("A1:A4").format = { font: { name: "Microsoft YaHei" }, wrapText: true };
  note.getRange("A1").format = { font: { bold: true, size: 14, color: "#1F4E79" } };
  note.getRange("A:A").format.columnWidth = 88;
  note.showGridLines = false;

  const dataSheet = workbook.worksheets.add("公开指标数据");
  const values = [headers, ...records.map((record) => headers.map((h) => record[h] ?? ""))];
  dataSheet.getRangeByIndexes(0, 0, values.length, headers.length).values = values;
  const headerRange = dataSheet.getRangeByIndexes(0, 0, 1, headers.length);
  headerRange.format = { fill: "#1F4E79", font: { bold: true, color: "#FFFFFF" } };
  dataSheet.getRangeByIndexes(0, 0, values.length, headers.length).format = {
    font: { name: "Microsoft YaHei", size: 10 },
    wrapText: false,
  };
  dataSheet.getRangeByIndexes(0, 0, values.length, headers.length).format.borders = {
    preset: "inside",
    style: "thin",
    color: "#DDE3EC",
  };
  dataSheet.freezePanes.freezeRows(1);
  dataSheet.getRange("A:S").format.autofitColumns();
  dataSheet.getRange("I:I").format.numberFormat = "#,##0.00";
  dataSheet.showGridLines = false;

  const preview = await workbook.render({ sheetName: "公开指标数据", range: "A1:S18", scale: 1, format: "png" });
  await fs.writeFile(path.join(repoRoot, "workbook-preview.png"), new Uint8Array(await preview.arrayBuffer()));
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
}

async function main() {
  const publicXlsx = await firstXlsx(repoRoot);
  const privateXlsx = await firstXlsx(privateRoot);
  const publicRows = await readWorkbookRows(publicXlsx);
  const privateRows = await readWorkbookRows(privateXlsx);
  const headers = publicRows[0];
  const publicRecords = rowObjects(publicRows).map(normalizeRecord);
  const privateRecords = rowObjects(privateRows).map(normalizeRecord);
  const basePublic = publicRecords.filter((record) => !String(record.region_tier || "").startsWith("3"));
  const subprov = privateRecords.filter(isPublishableSubprov).map(publicizeSubprov);
  const additions = await loadAdditions();
  const mergedMap = new Map();
  [...basePublic, ...subprov, ...additions].map(normalizeRecord).forEach((record) => {
    mergedMap.set(recordKey(record), record);
  });
  const merged = [...mergedMap.values()].sort(sortRecord);

  await buildWorkbook(headers, merged, publicXlsx);

  const htmlPath = path.join(repoRoot, "index.html");
  const html = await fs.readFile(htmlPath, "utf8");
  const dataLiteral = JSON.stringify(merged);
  const nextHtml = html.replace(/const DATA=\[.*?\];\s*const \$=/s, `const DATA=${dataLiteral};\nconst $=`);
  if (nextHtml === html) throw new Error("DATA block not replaced");
  await fs.writeFile(htmlPath, nextHtml, "utf8");

  const cityCount = new Set(subprov.map((record) => record.region)).size;
  console.log(JSON.stringify({
    publicBaseRows: basePublic.length,
    subprovRows: subprov.length,
    additions: additions.length,
    subprovCities: cityCount,
    mergedRows: merged.length,
    publicXlsx,
    privateXlsx,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
