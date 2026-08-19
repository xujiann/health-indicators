import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataScript = fs.readFileSync(path.join(repoRoot, "public-data.js"), "utf8");
const match = dataScript.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
if (!match) throw new Error("Data block not found in public-data.js");

const data = JSON.parse(match[1]);
const quality = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "data-quality-report.json"), "utf8"));
const dataDir = path.join(repoRoot, "data");
const rawFiles = fs.readdirSync(dataDir)
  .filter((file) => file === "base-public-records.json" || file.endsWith("-additions.json"))
  .sort();

function expandRawRecord(record, defaults = {}) {
  if (record && record.year != null && Object.hasOwn(record, "value")) {
    return [{ ...defaults, ...record }];
  }
  if (record && record.values && typeof record.values === "object") {
    return Object.entries(record.values).map(([year, value]) => ({
      ...defaults,
      ...record,
      year: +year,
      value,
    }));
  }
  if (record && record.metrics && typeof record.metrics === "object") {
    return Object.entries(record.metrics).map(([metric, value]) => ({
      ...defaults,
      ...record,
      indicator: record.indicator || metric,
      compare_key: record.compare_key || (defaults.compare_key_prefix ? `${defaults.compare_key_prefix}:${metric}` : metric),
      year: +record.year,
      value,
    }));
  }
  return [];
}

function expandRawFile(file) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  if (Array.isArray(parsed)) return parsed;
  const defaults = {
    source: parsed.source || parsed.kind || file,
    doc_no: parsed.doc_no || "",
    source_url: parsed.source_url || "",
    note: parsed.note || "",
    compare_key_prefix: parsed.kind === "national-medical-insurance-series-v1"
      ? (parsed.series_label || parsed.source_title || file)
      : "",
  };
  if (Array.isArray(parsed.records)) return parsed.records.flatMap((record) => expandRawRecord(record, defaults));
  if (Array.isArray(parsed.years)) return parsed.years.flatMap((record) => expandRawRecord(record, defaults));
  throw new Error(`Unsupported JSON shape in data/${file}`);
}

const rawData = rawFiles.flatMap(expandRawFile);

function recordKey(record) {
  return [
    record.region_code,
    record.year,
    record.compare_key,
    record.nature,
    record.region_tier,
  ].join("|");
}

function looksLikePdfFragment(record) {
  const isNHCExtract = String(record.source_url || "").includes("nhc.gov.cn")
    || String(record.note || "").includes("PDF");
  if (!isNHCExtract) return false;
  const indicator = String(record.indicator || "");
  const compareKey = String(record.compare_key || "");
  const text = `${indicator} ${compareKey}`;
  return /^\s*\d+(?:\.\d+)?[%‰]?[^\u5c81]*[）；其中]/.test(indicator)
    || /^[万亿]人次（占/.test(indicator)
    || /[万亿]人次（占/.test(text)
    || /4023\.1\s*万人次（占/.test(text)
    || /^其中：/.test(indicator)
    || /^类/.test(indicator)
    || /其中：城市/.test(indicator)
    || /下降.*城市/.test(indicator);
}

function analyze(records) {
  const duplicateKeys = new Map();
  for (const record of records) {
    const key = recordKey(record);
    const rows = duplicateKeys.get(key) || [];
    rows.push(record);
    duplicateKeys.set(key, rows);
  }
  const duplicates = [...duplicateKeys.entries()].filter(([, rows]) => rows.length > 1);
  const badYears = records.filter((record) => !Number.isFinite(+record.year) || +record.year < 1900 || +record.year > 2035);
  const badValues = records.filter((record) => {
    if (record.value === "" || record.value == null) return false;
    const text = String(record.value);
    return /\d/.test(text) && Number.isNaN(parseFloat(text.replace(/,/g, "")));
  });
  const pdfFragments = records.filter(looksLikePdfFragment);
  return { duplicates, badYears, badValues, pdfFragments };
}

const built = analyze(data);
const raw = analyze(rawData);
const missingSourceUrls = data.filter((record) => !String(record.source_url || "").trim());
const reviewRecords = data.filter((record) => /用户提供图片表|待正式来源复核/.test(
  `${record.source || ""} ${record.doc_no || ""} ${record.note || ""}`,
));
const restrictedRecords = data.filter((record) => /内部资料|仅限内部使用|内部文件|注意保存/.test(
  `${record.doc_no || ""} ${record.source_url || ""}`,
));
const sourceIndexRows = data.filter((record) => String(record.note || "").includes("公开来源索引（非单条原文）"));
const unitsByCompareKey = new Map();
for (const record of data) {
  const units = unitsByCompareKey.get(record.compare_key) || new Set();
  units.add(record.unit);
  unitsByCompareKey.set(record.compare_key, units);
}
const mixedComparisonUnits = [...unitsByCompareKey.entries()]
  .filter(([, units]) => units.size > 1)
  .map(([compareKey, units]) => ({ compareKey, units: [...units] }));

const result = {
  rows: data.length,
  rawRows: rawData.length,
  rawFiles: rawFiles.length,
  duplicateKeys: built.duplicates.length,
  badYears: built.badYears.length,
  badValues: built.badValues.length,
  pdfFragments: built.pdfFragments.length,
  rawDuplicateKeys: raw.duplicates.length,
  rawBadYears: raw.badYears.length,
  rawBadValues: raw.badValues.length,
  rawPdfFragments: raw.pdfFragments.length,
  missingSourceUrls: missingSourceUrls.length,
  reviewRecords: reviewRecords.length,
  restrictedRecords: restrictedRecords.length,
  sourceIndexRows: sourceIndexRows.length,
  mixedComparisonUnits: mixedComparisonUnits.length,
  schemaErrors: quality.summary.schema_errors,
  sourceComplete: quality.summary.source_complete,
  conflicts: quality.summary.conflicts,
};

console.log(JSON.stringify(result, null, 2));

if (
  built.duplicates.length
  || built.badYears.length
  || built.badValues.length
  || built.pdfFragments.length
  || raw.duplicates.length
  || raw.badYears.length
  || raw.badValues.length
  || raw.pdfFragments.length
  || missingSourceUrls.length
  || reviewRecords.length
  || restrictedRecords.length
  || mixedComparisonUnits.length
  || quality.summary.schema_errors
  || quality.summary.conflicts
  || quality.summary.source_complete !== data.length
) {
  const sample = {
    duplicates: built.duplicates.slice(0, 3).map(([key, rows]) => ({ key, rows: rows.length })),
    badYears: built.badYears.slice(0, 3),
    badValues: built.badValues.slice(0, 3),
    pdfFragments: built.pdfFragments.slice(0, 5).map((record) => ({
      year: record.year,
      subcategory: record.subcategory,
      indicator: record.indicator,
      value: record.value,
      unit: record.unit,
    })),
    rawDuplicates: raw.duplicates.slice(0, 3).map(([key, rows]) => ({ key, rows: rows.length })),
    rawBadYears: raw.badYears.slice(0, 3),
    rawBadValues: raw.badValues.slice(0, 3),
    rawPdfFragments: raw.pdfFragments.slice(0, 5).map((record) => ({
      year: record.year,
      subcategory: record.subcategory,
      indicator: record.indicator,
      value: record.value,
      unit: record.unit,
    })),
    missingSourceUrls: missingSourceUrls.slice(0, 5),
    reviewRecords: reviewRecords.slice(0, 5),
    restrictedRecords: restrictedRecords.slice(0, 5),
    mixedComparisonUnits: mixedComparisonUnits.slice(0, 10),
  };
  console.error(JSON.stringify(sample, null, 2));
  process.exitCode = 1;
}
