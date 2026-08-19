import { SOURCE_INDEX_NOTE } from "./subprov-core.mjs";

export const PROVENANCE_HEADERS = [
  "record_key", "region", "year", "compare_key", "current_source_url",
  "source_url", "source", "responsible", "doc_no", "note",
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

export function parseProvenanceCsv(text) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return [];
  const headers = rows[0].map(clean);
  const missing = PROVENANCE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV 缺少字段：${missing.join("、")}`);
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
}

export function parseProvenanceJson(text) {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) throw new Error("JSON 必须是数组，或包含 rows 数组");
  return rows;
}

function isPreciseGovernmentUrl(value, currentUrl) {
  try {
    const url = new URL(value);
    const government = ["http:", "https:"].includes(url.protocol)
      && (url.hostname === "gov.cn" || url.hostname.endsWith(".gov.cn"));
    const precisePath = url.pathname !== "/" && !/\/(?:index\.html?)?$/i.test(url.pathname);
    return government && precisePath && value !== currentUrl;
  } catch {
    return false;
  }
}

export function validateProvenanceRows(rows, publishedByKey, existingKeys = new Set()) {
  const accepted = [];
  const errors = [];
  const seen = new Set();
  let blank = 0;

  rows.forEach((input, index) => {
    const row = Object.fromEntries(PROVENANCE_HEADERS.map((header) => [header, clean(input?.[header])]));
    const replacementFields = ["source_url", "source", "responsible", "doc_no", "note"];
    if (replacementFields.every((field) => !row[field])) {
      blank += 1;
      return;
    }
    const label = `第 ${index + 2} 行（${row.region || "未知地区"} ${row.year || "未知年份"} ${row.compare_key || "未知指标"}）`;
    const record = publishedByKey.get(row.record_key);
    const rowErrors = [];
    if (!record) {
      rowErrors.push("record_key 在当前公开数据中不存在");
    } else {
      if (!String(record.note || "").includes(SOURCE_INDEX_NOTE)) rowErrors.push("目标记录不是来源索引记录");
      if (row.region !== String(record.region)) rowErrors.push(`region 应为 ${record.region}`);
      if (row.year !== String(record.year)) rowErrors.push(`year 应为 ${record.year}`);
      if (row.compare_key !== String(record.compare_key)) rowErrors.push(`compare_key 应为 ${record.compare_key}`);
      if (row.current_source_url !== String(record.source_url)) rowErrors.push("current_source_url 与当前数据不一致");
    }
    if (!isPreciseGovernmentUrl(row.source_url, row.current_source_url)) {
      rowErrors.push("source_url 必须是不同于栏目入口的 gov.cn 政府网站具体原文链接");
    }
    if (!row.source) rowErrors.push("source 不能为空");
    if (!row.responsible) rowErrors.push("responsible 不能为空");
    if (existingKeys.has(row.record_key)) rowErrors.push("该记录已经存在来源证据覆盖");
    if (seen.has(row.record_key)) rowErrors.push("本次补录中存在重复 record_key");
    if (rowErrors.length) {
      errors.push(`${label}：${rowErrors.join("；")}`);
      return;
    }
    seen.add(row.record_key);
    accepted.push({
      record_key: row.record_key,
      source_url: row.source_url,
      source: row.source,
      responsible: row.responsible,
      doc_no: row.doc_no || "—（公开原文）",
      note: row.note,
    });
  });
  return { accepted, blank, errors };
}

export function mergeProvenanceOverrides(existing, accepted) {
  if (existing.schema_version !== 1 || !Array.isArray(existing.overrides)) {
    throw new Error("来源证据覆盖文件格式不受支持");
  }
  const overrides = [...existing.overrides];
  const keys = new Set(overrides.map((entry) => entry.record_key));
  for (const row of accepted) {
    if (keys.has(row.record_key)) throw new Error(`${row.record_key} 已存在于来源证据覆盖文件`);
    overrides.push(row);
    keys.add(row.record_key);
  }
  overrides.sort((a, b) => a.record_key.localeCompare(b.record_key, "zh-Hans"));
  return { ...existing, overrides };
}
