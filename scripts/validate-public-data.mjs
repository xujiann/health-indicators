import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/const DATA=(\[[\s\S]*?\]);\n/);
if (!match) throw new Error("DATA block not found in index.html");

const data = JSON.parse(match[1]);
const rawFiles = fs.readdirSync("data")
  .filter((file) => file.endsWith(".json"))
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
  const parsed = JSON.parse(fs.readFileSync(`data/${file}`, "utf8"));
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
  };
  console.error(JSON.stringify(sample, null, 2));
  process.exitCode = 1;
}
