(function initializeHealthIndicatorsCore(root) {
  const TOTAL_UNITS = ["亿元", "万人", "个", "张", "人", "万人次", "所", "支", "家"];
  const METRIC_FORM_OPTS = [
    ["rate", "比例/比率"],
    ["density", "人均/密度"],
    ["money", "资金/费用"],
    ["service", "服务人次"],
    ["resource", "机构/床位/数量"],
    ["total", "规模总量"],
    ["target", "目标任务"],
  ];
  const AGENCY_ORDER = ["国家医保局", "国家卫健委", "国家统计局", "财政部", "地方部门", "用户提供材料", "其他公开来源"];
  const YEAR_RANGE_OPTS = [["recent3", "2023-2025"], ["recent5", "2021-2025"], ["since2020", "2020年以来"]];

  const tierClass = (tier) => ({
    "1·全国": "tier-1",
    "2·省(区市)": "tier-2",
    "3·副省级城市": "tier-3",
  }[tier] || "tier-1");
  const tierName = (tier) => (tier || "").split("·").slice(1).join("·") || tier;
  const tierNo = (tier) => +(String(tier)[0] || 9);
  const catShort = (category) => String(category || "").replace("卫生健康(", "").replace(")", "");
  const numOf = (value) => {
    const match = String(value).match(/-?\d[\d,]*\.?\d*/);
    return match ? parseFloat(match[0].replace(/,/g, "")) : null;
  };
  const isTotal = (unit) => TOTAL_UNITS.includes(String(unit || "").trim());
  const esc = (value) => String(value == null ? "" : value).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]),
  );

  function natKind(nature) {
    const value = nature || "";
    if (value.includes("实际")) return "actual";
    if (value.includes("约束")) return "limit";
    if (value.includes("目标") || value.includes("指导")) return "target";
    return "task";
  }

  function metricForm(record) {
    if (natKind(record.nature) !== "actual") return "target";
    const text = [record.indicator, record.compare_key, record.unit].filter(Boolean).join(" ");
    const unit = String(record.unit || "");
    if (/%|率|比重|占比|比例/.test(text)) return "rate";
    if (/每千|每万|人均|平均/.test(text)) return "density";
    if (/人次|诊疗|就诊|门诊|住院/.test(text) || /人次/.test(unit)) return "service";
    if (/亿元|万元|元/.test(unit) || /费用|基金|支出|收入|支付|筹资|价格/.test(text)) return "money";
    if (/机构|医院|床位|卫生室|人员|医师|护士|药品|疫苗|种|所|家|张|个/.test(text)) return "resource";
    return "total";
  }

  const metricFormLabel = (value) => (METRIC_FORM_OPTS.find((item) => item[0] === value) || [])[1] || value;

  function sourceAgency(record) {
    const text = [record.responsible, record.source, record.doc_no, record.source_url].filter(Boolean).join(" ");
    if (/国家医疗保障局|nhsa\.gov\.cn/.test(text)) return "国家医保局";
    if (/国家卫生健康委|国家卫生计生委|nhc\.gov\.cn/.test(text)) return "国家卫健委";
    if (/国家统计局|stats\.gov\.cn/.test(text)) return "国家统计局";
    if (/财政部|mof\.gov\.cn/.test(text)) return "财政部";
    if (/用户提供图片表|用户提供|医保数智库/.test(text)) return "用户提供材料";
    if (/统计局|人民政府|卫生健康委|财政局/.test(text)) return "地方部门";
    return "其他公开来源";
  }

  const yearRangeBounds = (key) => ({
    recent3: [2023, 2025],
    recent5: [2021, 2025],
    since2020: [2020, 2025],
  }[key] || null);

  function indicatorFamily(record) {
    const name = String(record.indicator || record.compare_key || "")
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/[\s·、，,：:]/g, "")
      .replace(/^(全国|地区|国内|年末)/, "");
    if (/人均.*(生产总值|GDP)/i.test(name)) return "人均GDP";
    if (/(生产总值|GDP)/i.test(name)) return "GDP";
    if (/常住人口/.test(name)) return "年末常住人口";
    return name || String(record.compare_key || "未命名指标");
  }

  function queryMatches(record, query) {
    const raw = [
      record.indicator, record.compare_key, record.category, record.subcategory,
      record.year, record.unit, record.nature, record.note, record.region,
      record.source, record.responsible, record.doc_no, sourceAgency(record),
    ].join(" ").toLowerCase();
    const terms = String(query || "").match(/"[^"]+"|\S+/g) || [];
    const excluded = terms
      .filter((term) => term.startsWith("-"))
      .map((term) => term.slice(1).replace(/^"|"$/g, "").toLowerCase())
      .filter(Boolean);
    if (excluded.some((term) => raw.includes(term))) return false;
    const words = terms
      .filter((term) => !term.startsWith("-"))
      .map((term) => term.replace(/^"|"$/g, "").toLowerCase())
      .filter(Boolean);
    if (!words.length || words.every((word) => raw.includes(word))) return true;
    const requested = indicatorFamily({ indicator: words[0] });
    return words.length === 1 && requested.length >= 2 && indicatorFamily(record) === requested;
  }

  function sourceStatus(input) {
    const records = Array.isArray(input) ? input : [input];
    const text = records.map((record) => [record?.source, record?.doc_no, record?.note].join(" ")).join(" ");
    const withUrl = records.filter((record) => record?.source_url).length;
    if (/用户提供图片表|待正式来源复核/.test(text)) {
      return { label: "待复核", cls: "review", title: "用户图片表录入，引用前请以正式来源复核" };
    }
    if (/公开来源索引（非单条原文）/.test(text)) {
      return { label: "来源索引", cls: "index", title: "链接指向地区官方公开入口，不代表单条指标原文" };
    }
    if (withUrl === records.length) return { label: "原文链接", cls: "link", title: "全部记录带来源链接" };
    if (withUrl > 0) return { label: "部分链接", cls: "partial", title: "部分记录带来源链接" };
    if (/经确认可公开|公开统计公报|公开补录/.test(text)) {
      return { label: "可公开", cls: "open", title: "已标注公开或经确认可公开" };
    }
    return { label: "待补链", cls: "", title: "当前记录未提供可打开的来源链接" };
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

  root.HealthIndicatorsCore = Object.freeze({
    TOTAL_UNITS,
    METRIC_FORM_OPTS,
    AGENCY_ORDER,
    YEAR_RANGE_OPTS,
    tierClass,
    tierName,
    tierNo,
    natKind,
    catShort,
    numOf,
    isTotal,
    esc,
    metricForm,
    metricFormLabel,
    sourceAgency,
    yearRangeBounds,
    indicatorFamily,
    queryMatches,
    sourceStatus,
    recordKey,
  });
}(globalThis));
