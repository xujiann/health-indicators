import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const privateRoot = path.resolve(repoRoot, "..", "health-indicators-private");
const additionsPath = path.join(repoRoot, "data", "stat-bulletin-additions.json");

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
    const text = await fs.readFile(additionsPath, "utf8");
    return JSON.parse(text).map(normalizeRecord);
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
  note.getRange("A3").values = [[`本表仅含公开发布及经确认可公开的副省级城市指标数据，共${records.length}条，不含未公开规划文件。`]];
  note.getRange("A4").values = [["本版纳入15个副省级城市公开对标数据；引用请以原始公报或正式来源为准。"]];
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
