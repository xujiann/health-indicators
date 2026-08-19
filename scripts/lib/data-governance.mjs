import crypto from "node:crypto";

export const PUBLIC_RECORD_FIELDS = [
  "region_code", "region", "level", "year", "category", "subcategory",
  "indicator", "nature", "value", "unit", "yoy", "deadline", "responsible",
  "source", "doc_no", "source_url", "note", "compare_key", "region_tier",
];

export function recordKey(record) {
  return [record.region_code, record.year, record.compare_key, record.nature, record.region_tier].join("|");
}

export function evidenceScore(record) {
  const url = String(record.source_url || "");
  const note = String(record.note || "");
  let score = 0;
  if (/\.gov\.cn(?:\/|$)|https?:\/\/gov\.cn(?:\/|$)/i.test(url)) score += 35;
  else if (/^https?:\/\//.test(url)) score += 20;
  if (url && !/\/(?:index|common_list)?\.?(?:s?html?)?$/i.test(new URL(url).pathname)) score += 20;
  if (record.responsible) score += 15;
  if (record.source) score += 15;
  if (record.doc_no) score += 5;
  if (!/来源索引|待复核|非单条原文/.test(note)) score += 10;
  return Math.min(score, 100);
}

export function analyzeRecords(records, { collectedAt = null } = {}) {
  const schemaErrors = [];
  const anomalies = [];
  const groups = new Map();
  for (const record of records) {
    const key = recordKey(record);
    const missing = PUBLIC_RECORD_FIELDS.filter((field) => !(field in record));
    if (missing.length) schemaErrors.push({ record_key: key, rule: "missing_fields", fields: missing });
    if (!record.region || !record.compare_key || !record.unit || !record.source_url) {
      schemaErrors.push({ record_key: key, rule: "required_value" });
    }
    const value = Number(record.value);
    if (record.nature === "实际值" && !Number.isFinite(value)) anomalies.push({ record_key: key, rule: "non_numeric_actual" });
    if (Number.isFinite(value) && value < 0) anomalies.push({ record_key: key, rule: "negative_value", value });
    if (record.unit === "%" && Number.isFinite(value) && (value < 0 || value > 100)) anomalies.push({ record_key: key, rule: "percentage_range", value });
    if (+record.year < 1949 || +record.year > new Date().getUTCFullYear() + 5) anomalies.push({ record_key: key, rule: "year_range", value: record.year });
    const conflictKey = [record.region_code, record.year, record.compare_key, record.nature].join("|");
    const values = groups.get(conflictKey) || [];
    values.push(record);
    groups.set(conflictKey, values);
  }
  const conflicts = [...groups.entries()].flatMap(([key, rows]) => {
    const values = new Set(rows.map((row) => `${row.value}|${row.unit}`));
    if (values.size < 2) return [];
    return [{ conflict_key: key, values: rows.map((row) => ({ value: row.value, unit: row.unit, source_url: row.source_url })) }];
  });
  const evidence = records.map((record) => ({
    record_key: recordKey(record),
    score: evidenceScore(record),
    source_url: record.source_url,
    collected_at: collectedAt,
    content_sha256: crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex"),
  }));
  return { schemaErrors, anomalies, conflicts, evidence };
}
