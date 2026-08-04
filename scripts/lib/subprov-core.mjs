export const SUBPROV_CITIES = [
  { code: "210200", name: "大连市" },
  { code: "510100", name: "成都市" },
  { code: "440100", name: "广州市" },
  { code: "230100", name: "哈尔滨市" },
  { code: "330100", name: "杭州市" },
  { code: "370100", name: "济南市" },
  { code: "320100", name: "南京市" },
  { code: "330200", name: "宁波市" },
  { code: "370200", name: "青岛市" },
  { code: "350200", name: "厦门市" },
  { code: "440300", name: "深圳市" },
  { code: "210100", name: "沈阳市" },
  { code: "420100", name: "武汉市" },
  { code: "610100", name: "西安市" },
  { code: "220100", name: "长春市" },
];

export const SUBPROV_YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

export const SUBPROV_CORE_METRICS = {
  gdp: { compare_key: "GDP", unit: "亿元" },
  gdp_per_capita: { compare_key: "人均GDP", unit: "元" },
  resident_population: { compare_key: "年末常住人口", unit: "万人" },
  registered_population: { compare_key: "年末户籍人口", unit: "万人" },
  urbanization_rate: { compare_key: "城镇化率(常住)", unit: "%" },
  local_public_budget_revenue: { compare_key: "地方一般公共预算收入", unit: "亿元" },
  local_public_budget_expenditure: { compare_key: "地方一般公共预算支出", unit: "亿元" },
};

export const SOURCE_INDEX_NOTE = "公开来源索引（非单条原文）";

export const cityByName = new Map(SUBPROV_CITIES.map((city) => [city.name, city]));
export const cityByCode = new Map(SUBPROV_CITIES.map((city) => [city.code, city]));
export const metricByCompareKey = new Map(
  Object.entries(SUBPROV_CORE_METRICS).map(([key, metric]) => [metric.compare_key, { key, ...metric }]),
);
