const infectiousDiseases = {
  甲乙类传染病: new Set([
    "合计", "鼠疫", "霍乱", "新型冠状病毒感染", "传染性非典型肺炎",
    "艾滋病", "病毒性肝炎", "脊髓灰质炎", "人感染新亚型流感",
    "人感染高致病性禽流感", "麻疹", "流行性出血热", "狂犬病",
    "流行性乙型脑炎", "登革热", "猴痘", "炭疽",
    "细菌性和阿米巴性痢疾", "肺结核", "伤寒和副伤寒",
    "流行性脑脊髓膜炎", "百日咳", "白喉", "新生儿破伤风",
    "猩红热", "布鲁氏菌病", "淋病", "梅毒", "钩端螺旋体病",
    "血吸虫病", "疟疾",
  ]),
  丙类传染病: new Set([
    "合计", "流行性感冒", "流行性腮腺炎", "风疹",
    "急性出血性结膜炎", "麻风病", "流行性和地方性斑疹伤寒",
    "斑疹伤寒", "黑热病", "包虫病", "丝虫病", "手足口病",
    "其他感染性腹泻病",
  ]),
};

const knownStructuralFragments = new Set([
  "的", "机构", "基层医疗卫生机构", "疗卫生机构", "人次的",
  "生室诊疗人次", "科室", "诊所", "构中医类临床科室",
  "机构总诊疗人次", "年，5 岁以下儿童死亡率", "农村", "村",
  "中医类医院",
]);

export function looksLikeNHCExtractFragment(record) {
  const isNHCExtract = String(record.source_url || "").includes("nhc.gov.cn")
    || String(record.note || "").includes("PDF");
  if (!isNHCExtract) return false;

  const indicator = String(record.indicator || "").trim();
  const compareKey = String(record.compare_key || "").trim();
  const text = `${indicator} ${compareKey}`;
  if (
    /^\s*\d+(?:\.\d+)?[%‰]?[^岁]*[）；其中]/.test(indicator)
    || /^[万亿]人次（占/.test(indicator)
    || /[万亿]人次（占/.test(text)
    || /4023\.1\s*万人次（占/.test(text)
    || /^其中：/.test(indicator)
    || /^类/.test(indicator)
    || /其中：城市/.test(indicator)
    || /下降.*城市/.test(indicator)
    || /位数由|亿。|亿人次，/.test(indicator)
    || knownStructuralFragments.has(indicator)
  ) return true;

  const match = indicator.match(/^(甲乙类传染病|丙类传染病)(.+)报告(?:发病例数|死亡人数)$/);
  return Boolean(match && !infectiousDiseases[match[1]].has(match[2]));
}
