import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const privateRoot = path.resolve(repoRoot, "..", "health-indicators-private");
const additionsDir = path.join(repoRoot, "data");
const publicWorkbookPath = path.join(repoRoot, "公开指标数据库.xlsx");
const privateWorkbookPath = path.join(privateRoot, "核心指标数据库.xlsx");

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

const nationalMedicalInsuranceMetricDefinitions = {
  basic_insurance_enrollees: { subcategory: "参保规模", indicator: "基本医疗保险参保人数", unit: "万人" },
  basic_insurance_coverage_rate: { subcategory: "参保规模", indicator: "基本医疗保险参保率", unit: "%" },
  basic_fund_income: { subcategory: "基金收支", indicator: "基本医疗保险基金总收入（含生育保险）", unit: "亿元" },
  basic_fund_expenditure: { subcategory: "基金收支", indicator: "基本医疗保险基金总支出（含生育保险）", unit: "亿元" },
  basic_fund_current_balance: { subcategory: "基金收支", indicator: "基本医疗保险统筹基金当期结存", unit: "亿元" },
  basic_fund_cumulative_balance: { subcategory: "基金收支", indicator: "基本医疗保险统筹基金累计结存", unit: "亿元" },
  employee_enrollees: { subcategory: "参保规模", indicator: "职工基本医疗保险参保人数", unit: "万人" },
  employee_active_enrollees: { subcategory: "参保规模", indicator: "职工医保在职职工参保人数", unit: "万人" },
  employee_retiree_enrollees: { subcategory: "参保规模", indicator: "职工医保退休人员参保人数", unit: "万人" },
  resident_enrollees: { subcategory: "参保规模", indicator: "城乡居民基本医疗保险参保人数", unit: "万人" },
  employee_fund_income: { subcategory: "基金收支", indicator: "职工医保基金收入（含生育保险）", unit: "亿元" },
  employee_fund_expenditure: { subcategory: "基金收支", indicator: "职工医保基金支出（含生育保险）", unit: "亿元" },
  employee_pool_income: { subcategory: "基金收支", indicator: "职工医保统筹基金收入（含生育保险）", unit: "亿元" },
  employee_pool_expenditure: { subcategory: "基金收支", indicator: "职工医保统筹基金支出（含生育保险）", unit: "亿元" },
  employee_account_income: { subcategory: "基金收支", indicator: "职工医保个人账户收入", unit: "亿元" },
  employee_account_expenditure: { subcategory: "基金收支", indicator: "职工医保个人账户支出", unit: "亿元" },
  resident_fund_income: { subcategory: "基金收支", indicator: "居民医保基金收入", unit: "亿元" },
  resident_fund_expenditure: { subcategory: "基金收支", indicator: "居民医保基金支出", unit: "亿元" },
  resident_fund_current_balance: { subcategory: "基金收支", indicator: "居民医保基金当期结存", unit: "亿元" },
  resident_fund_cumulative_balance: { subcategory: "基金收支", indicator: "居民医保基金累计结存", unit: "亿元" },
  employee_benefit_visits: { subcategory: "待遇人次", indicator: "职工医保待遇享受人次", unit: "亿人次" },
  employee_outpatient_visits: { subcategory: "待遇人次", indicator: "职工医保普通门急诊人次", unit: "亿人次" },
  employee_chronic_outpatient_visits: { subcategory: "待遇人次", indicator: "职工医保门诊慢特病人次", unit: "亿人次" },
  employee_inpatient_visits: { subcategory: "待遇人次", indicator: "职工医保住院人次", unit: "亿人次" },
  employee_pharmacy_visits: { subcategory: "待遇人次", indicator: "职工医保药店购药人次", unit: "亿人次" },
  employee_avg_inpatient_cost: { subcategory: "待遇费用", indicator: "职工医保次均住院费用", unit: "元" },
  employee_avg_length_of_stay: { subcategory: "待遇费用", indicator: "职工医保次均住院床日", unit: "天" },
  employee_medical_expenses: { subcategory: "待遇费用", indicator: "职工医保参保人员医药总费用", unit: "亿元" },
  employee_institution_expenses: { subcategory: "待遇费用", indicator: "职工医保医疗机构费用", unit: "亿元" },
  employee_pharmacy_expenses: { subcategory: "待遇费用", indicator: "职工医保药店费用", unit: "亿元" },
  employee_catalog_payment_ratio: { subcategory: "待遇费用", indicator: "职工医保住院目录内基金支付比例", unit: "%" },
  resident_benefit_visits: { subcategory: "待遇人次", indicator: "居民医保待遇享受人次", unit: "亿人次" },
  resident_outpatient_visits: { subcategory: "待遇人次", indicator: "居民医保普通门急诊人次", unit: "亿人次" },
  resident_chronic_outpatient_visits: { subcategory: "待遇人次", indicator: "居民医保门诊慢特病人次", unit: "亿人次" },
  resident_inpatient_visits: { subcategory: "待遇人次", indicator: "居民医保住院人次", unit: "亿人次" },
  resident_pharmacy_visits: { subcategory: "待遇人次", indicator: "居民医保药店购药人次", unit: "亿人次" },
  resident_avg_inpatient_cost: { subcategory: "待遇费用", indicator: "居民医保次均住院费用", unit: "元" },
  resident_avg_length_of_stay: { subcategory: "待遇费用", indicator: "居民医保次均住院床日", unit: "天" },
  resident_medical_expenses: { subcategory: "待遇费用", indicator: "居民医保参保人员医药费用", unit: "亿元" },
  resident_institution_expenses: { subcategory: "待遇费用", indicator: "居民医保医疗机构费用", unit: "亿元" },
  resident_pharmacy_expenses: { subcategory: "待遇费用", indicator: "居民医保药店购药费用", unit: "亿元" },
  resident_catalog_payment_ratio: { subcategory: "待遇费用", indicator: "居民医保住院目录内基金支付比例", unit: "%" },
  maternity_enrollees: { subcategory: "生育保险", indicator: "生育保险参保人数", unit: "万人" },
  maternity_benefit_visits: { subcategory: "生育保险", indicator: "生育保险待遇享受人次", unit: "万人次" },
  maternity_fund_expenditure: { subcategory: "生育保险", indicator: "生育保险基金支出", unit: "亿元" },
  medical_assistance_expenditure: { subcategory: "医疗救助", indicator: "医疗救助支出", unit: "亿元" },
  medical_assistance_subsidized_enrollees: { subcategory: "医疗救助", indicator: "医疗救助资助参保人数", unit: "万人" },
  medical_assistance_visits: { subcategory: "医疗救助", indicator: "医疗救助门诊和住院救助人次", unit: "万人次" },
  medical_assistance_inpatient_avg: { subcategory: "医疗救助", indicator: "次均住院救助金额", unit: "元" },
  medical_assistance_outpatient_avg: { subcategory: "医疗救助", indicator: "次均门诊救助金额", unit: "元" },
  catalog_drugs: { subcategory: "药品目录与采购", indicator: "国家医保药品目录西药和中成药数量", unit: "种" },
  catalog_new_drugs: { subcategory: "药品目录与采购", indicator: "国家医保药品目录新纳入药品数量", unit: "种" },
  negotiated_drug_reimbursements: { subcategory: "药品目录与采购", indicator: "谈判药报销人次", unit: "亿人次" },
  out_of_area_visits: { subcategory: "异地就医", indicator: "异地就医就诊人次", unit: "亿人次" },
  out_of_area_expenses: { subcategory: "异地就医", indicator: "异地就医费用", unit: "亿元" },
  recovered_funds: { subcategory: "基金监管", indicator: "追回医保基金", unit: "亿元" },
  long_term_care_enrollees: { subcategory: "长期护理保险", indicator: "长期护理保险参保人数", unit: "万人" },
  long_term_care_beneficiaries: { subcategory: "长期护理保险", indicator: "长期护理保险待遇享受人数", unit: "万人" },
  long_term_care_fund_income: { subcategory: "长期护理保险", indicator: "长期护理保险基金收入", unit: "亿元" },
  long_term_care_fund_expenditure: { subcategory: "长期护理保险", indicator: "长期护理保险基金支出", unit: "亿元" },
  long_term_care_institutions: { subcategory: "长期护理保险", indicator: "长期护理保险定点服务机构数", unit: "家" },
  long_term_care_workers: { subcategory: "长期护理保险", indicator: "长期护理保险护理服务人员数", unit: "万人" },
  cross_province_network_institutions: { subcategory: "异地就医", indicator: "跨省联网定点医药机构数", unit: "万家" },
  cross_province_inpatient_visits: { subcategory: "异地就医", indicator: "住院费用跨省直接结算人次", unit: "万人次" },
  cross_province_inpatient_payment: { subcategory: "异地就医", indicator: "住院费用跨省直接结算基金支付", unit: "亿元" },
  cross_province_outpatient_visits: { subcategory: "异地就医", indicator: "门诊费用跨省直接结算人次", unit: "亿人次" },
  cross_province_outpatient_payment: { subcategory: "异地就医", indicator: "门诊费用跨省直接结算基金支付", unit: "亿元" },
  personal_account_mutual_aid_usage: { subcategory: "经办服务", indicator: "职工医保个人账户共济使用金额", unit: "亿元" },
};

async function assertFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Required workbook not found: ${filePath}`);
  }
  return filePath;
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

function expandNationalCrossDomainSeries(payload) {
  return payload.records.flatMap((series) => Object.entries(series.values || {})
    .filter(([, value]) => value !== null && value !== "")
    .map(([year, value]) => normalizeRecord({
      region_code: "000000",
      region: "全国",
      level: "国家",
      year: Number(year),
      category: series.category,
      subcategory: series.subcategory,
      indicator: series.indicator,
      nature: "实际值",
      value,
      unit: series.unit,
      yoy: "",
      deadline: "",
      responsible: payload.responsible || "",
      source: payload.source,
      doc_no: payload.doc_no || "—（公开补录）",
      source_url: payload.source_url || "",
      note: [payload.note, series.note].filter(Boolean).join("；"),
      compare_key: series.compare_key || series.indicator,
      region_tier: "1·全国",
    })));
}

function expandNationalMedicalInsuranceSeries(payload) {
  return payload.years.flatMap((entry) => Object.entries(entry.metrics).map(([metricKey, value]) => {
    const definition = nationalMedicalInsuranceMetricDefinitions[metricKey];
    if (!definition) throw new Error(`Unknown national medical insurance metric: ${metricKey}`);
    const label = payload.series_label || "年度统计公报";
    return normalizeRecord({
      region_code: "000000",
      region: "全国",
      level: "国家",
      year: entry.year,
      category: "医疗保障",
      subcategory: definition.subcategory,
      indicator: `${definition.indicator}（${label}）`,
      nature: "实际值",
      value,
      unit: definition.unit,
      yoy: entry.yoy?.[metricKey] || "",
      deadline: "",
      responsible: "国家医疗保障局",
      source: `${entry.year}年${payload.source_title || "全国医疗保障事业发展统计公报"}`,
      doc_no: `—（国家医疗保障局${label}）`,
      source_url: entry.source_url,
      note: [payload.note, entry.note, entry.metric_notes?.[metricKey]].filter(Boolean).join("；"),
      compare_key: `${definition.indicator}（${label}）`,
      region_tier: "1·全国",
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

function isGeneratedNationalHealth(record) {
  return String(record.region_code || "") === "000000"
    && String(record.category || "") === "卫生健康"
    && String(record.responsible || "") === "国家卫生健康委"
    && String(record.source || "").includes("我国卫生健康事业发展统计公报");
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
      } else if (payload.kind === "national-cross-domain-series-v1") {
        additions.push(...expandNationalCrossDomainSeries(payload));
      } else if (payload.kind === "national-medical-insurance-series-v1") {
        additions.push(...expandNationalMedicalInsuranceSeries(payload));
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
  note.getRange("A4").values = [["本版纳入全国近十年卫生健康统计公报核心序列、2022-2024年公报扩展分类指标及15个副省级城市公开对标数据；引用请以原始公报或正式来源为准。"]];
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
  const tmpDir = path.join(repoRoot, "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, "workbook-preview.png"), new Uint8Array(await preview.arrayBuffer()));
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
}

async function main() {
  const publicXlsx = await assertFileExists(publicWorkbookPath);
  const privateXlsx = await assertFileExists(privateWorkbookPath);
  const publicRows = await readWorkbookRows(publicXlsx);
  const privateRows = await readWorkbookRows(privateXlsx);
  const headers = publicRows[0];
  const publicRecords = rowObjects(publicRows).map(normalizeRecord);
  const privateRecords = rowObjects(privateRows).map(normalizeRecord);
  const basePublic = publicRecords.filter((record) => !String(record.region_tier || "").startsWith("3") && !isGeneratedNationalHealth(record));
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
  const dataPattern = /const DATA=\[.*?\];\s*const \$=/s;
  if (!dataPattern.test(html)) throw new Error("DATA block not found");
  const nextHtml = html.replace(dataPattern, `const DATA=${dataLiteral};\nconst $=`);
  if (nextHtml !== html) await fs.writeFile(htmlPath, nextHtml, "utf8");

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
