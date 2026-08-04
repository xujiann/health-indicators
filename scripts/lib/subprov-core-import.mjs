import {
  SUBPROV_CORE_METRICS,
  SUBPROV_YEARS,
  cityByName,
} from "./subprov-core.mjs";

export const INTAKE_HEADERS = [
  "city", "region_code", "year", "metric_key", "compare_key", "unit",
  "value", "source_url", "source", "responsible", "doc_no", "note",
];

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV 存在未闭合的双引号");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim()));
}

export function parseIntakeCsv(text) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return [];
  const headers = rows[0].map(clean);
  const missing = INTAKE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV 缺少字段：${missing.join("、")}`);
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
}

export function parseIntakeJson(text) {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) throw new Error("JSON 必须是数组，或包含 rows 数组");
  return rows;
}

function isGovernmentUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && (url.hostname === "gov.cn" || url.hostname.endsWith(".gov.cn"));
  } catch {
    return false;
  }
}

function rowLabel(row, index) {
  return `第 ${index + 2} 行（${clean(row.city) || "未知城市"} ${clean(row.year) || "未知年份"} ${clean(row.metric_key) || "未知指标"}）`;
}

export function validateIntakeRows(rows, publishedIds = new Set()) {
  const accepted = [];
  const errors = [];
  const seen = new Set();
  let blank = 0;

  rows.forEach((input, index) => {
    const row = Object.fromEntries(INTAKE_HEADERS.map((header) => [header, clean(input?.[header])]));
    const evidenceFields = ["value", "source_url", "source", "responsible", "doc_no", "note"];
    if (evidenceFields.every((field) => !row[field])) {
      blank += 1;
      return;
    }

    const label = rowLabel(row, index);
    const city = cityByName.get(row.city);
    const metric = SUBPROV_CORE_METRICS[row.metric_key];
    const year = Number(row.year);
    const numeric = Number(row.value.replace(/,/g, ""));
    const rowErrors = [];

    if (!city) rowErrors.push("city 不在 15 个副省级城市清单中");
    if (city && row.region_code !== city.code) rowErrors.push(`region_code 应为 ${city.code}`);
    if (!Number.isInteger(year) || !SUBPROV_YEARS.includes(year)) rowErrors.push("year 必须为 2020—2025 的整数");
    if (!metric) rowErrors.push("metric_key 不在核心指标清单中");
    if (metric && row.compare_key !== metric.compare_key) rowErrors.push(`compare_key 应为 ${metric.compare_key}`);
    if (metric && row.unit !== metric.unit) rowErrors.push(`unit 应为 ${metric.unit}`);
    if (!row.value || !Number.isFinite(numeric)) rowErrors.push("value 必须是有限数值");
    if (!isGovernmentUrl(row.source_url)) rowErrors.push("source_url 必须是 gov.cn 政府网站的 http(s) 原文链接");
    if (!row.responsible) rowErrors.push("responsible 不能为空");

    const id = city && metric ? `${city.name}|${year}|${metric.compare_key}` : "";
    if (id && publishedIds.has(id)) rowErrors.push("该城市、年份、指标已经发布，补录命令不允许覆盖");
    if (id && seen.has(id)) rowErrors.push("本次补录中存在重复城市、年份、指标");
    if (rowErrors.length) {
      errors.push(`${label}：${rowErrors.join("；")}`);
      return;
    }

    seen.add(id);
    accepted.push({
      city: city.name,
      region_code: city.code,
      year,
      metric_key: row.metric_key,
      value: numeric,
      source_url: row.source_url,
      source: row.source || `${year}年${city.name}国民经济和社会发展统计公报`,
      responsible: row.responsible,
      doc_no: row.doc_no || "—（公开统计公报）",
      note: row.note,
    });
  });

  return { accepted, blank, errors };
}

export function mergeIntoPayload(existing, accepted) {
  const payload = existing || {
    kind: "subprov-stat-bulletin-series-v1",
    note: "通过副省级城市核心指标补录工作流，经官方原文和标准口径校验后入库",
    records: [],
  };
  if (payload.kind !== "subprov-stat-bulletin-series-v1" || !Array.isArray(payload.records)) {
    throw new Error("目标补录文件格式不受支持");
  }

  const records = structuredClone(payload.records);
  for (const row of accepted) {
    let target = records.find((record) => (
      record.region === row.city
      && Number(record.year) === row.year
      && record.source_url === row.source_url
      && (record.responsible || "") === row.responsible
      && (record.source || "") === row.source
      && (record.doc_no || "") === row.doc_no
      && (record.note || "") === row.note
    ));
    if (!target) {
      target = {
        region_code: row.region_code,
        region: row.city,
        year: row.year,
        responsible: row.responsible,
        source: row.source,
        doc_no: row.doc_no,
        source_url: row.source_url,
        note: row.note,
        metrics: {},
      };
      records.push(target);
    }
    if (Object.hasOwn(target.metrics, row.metric_key)) {
      throw new Error(`${row.city} ${row.year} ${row.metric_key} 已存在于目标补录文件`);
    }
    target.metrics[row.metric_key] = row.value;
  }
  records.sort((a, b) => (
    a.region.localeCompare(b.region, "zh-Hans")
    || Number(a.year) - Number(b.year)
    || a.source_url.localeCompare(b.source_url)
  ));
  return { ...payload, records };
}
