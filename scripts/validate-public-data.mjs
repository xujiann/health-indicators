import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/const DATA=(\[[\s\S]*?\]);\n/);
if (!match) throw new Error("DATA block not found in index.html");

const data = JSON.parse(match[1]);

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

const duplicateKeys = new Map();
for (const record of data) {
  const key = recordKey(record);
  const rows = duplicateKeys.get(key) || [];
  rows.push(record);
  duplicateKeys.set(key, rows);
}

const duplicates = [...duplicateKeys.entries()].filter(([, rows]) => rows.length > 1);
const badYears = data.filter((record) => !Number.isFinite(+record.year) || +record.year < 1900 || +record.year > 2035);
const badValues = data.filter((record) => {
  if (record.value === "" || record.value == null) return false;
  const text = String(record.value);
  return /\d/.test(text) && Number.isNaN(parseFloat(text.replace(/,/g, "")));
});
const pdfFragments = data.filter(looksLikePdfFragment);

const result = {
  rows: data.length,
  duplicateKeys: duplicates.length,
  badYears: badYears.length,
  badValues: badValues.length,
  pdfFragments: pdfFragments.length,
};

console.log(JSON.stringify(result, null, 2));

if (duplicates.length || badYears.length || badValues.length || pdfFragments.length) {
  const sample = {
    duplicates: duplicates.slice(0, 3).map(([key, rows]) => ({ key, rows: rows.length })),
    badYears: badYears.slice(0, 3),
    badValues: badValues.slice(0, 3),
    pdfFragments: pdfFragments.slice(0, 5).map((record) => ({
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
