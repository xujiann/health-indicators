import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "tmp" / "pdfs"
OUT = ROOT / "data" / "national-health-bulletin-expanded-additions.json"

SOURCE_URLS = {
    2022: "https://www.nhc.gov.cn/cms-search/downFiles/9b3fddc4703d4c9d9ad399bcca089f03.pdf",
    2023: "https://www.nhc.gov.cn/cms-search/downFiles/58c5d1e9876344e5b1aa5aa2b083a51a.pdf",
    2024: "https://www.nhc.gov.cn/guihuaxxs/c100133/202512/f1c3a3c617484a27a1a26a468afbaeee/files/2024%E5%B9%B4%E6%88%91%E5%9B%BD%E5%8D%AB%E7%94%9F%E5%81%A5%E5%BA%B7%E4%BA%8B%E4%B8%9A%E5%8F%91%E5%B1%95%E7%BB%9F%E8%AE%A1%E5%85%AC%E6%8A%A5-20251201161542231.pdf",
}


def pdf_lines(year):
    reader = PdfReader(str(PDF_DIR / f"{year}.pdf"))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]


def table_lines(lines, table_no):
    start = next(i for i, line in enumerate(lines) if line.startswith(f"表 {table_no} "))
    for i in range(start + 1, len(lines)):
        if lines[i].startswith(f"表 {table_no + 1} "):
            return lines[start:i]
    return lines[start:]


def tokens(line):
    found = []
    pattern = r"(?<![A-Za-z])(?:-?\d+(?:\.\d+)?|-)(?![A-Za-z])"
    for match in re.finditer(pattern, line):
        token = match.group(0)
        found.append((None if token == "-" else float(token), match.start()))
    return found


def current_values(line, count):
    found = tokens(line)
    if len(found) < count:
        return None, []
    tail = found[-count:]
    label = line[: tail[0][1]].strip()
    label = re.sub(r"^#\s*", "", label)
    label = re.sub(r"\d+$", "", label).strip()
    return label, [x[0] for x in tail]


def compact_rows(lines, value_count):
    rows = []
    pending = None
    header_markers = (
        "病床使用率（%）",
        "诊疗人次（万人次）",
        "诊疗人次数",
        "入院人次数",
        "发病例数",
        "死亡人数",
        "合计 城市 农村",
        "人员数 卫生技术人员",
    )
    for line in lines:
        if not line or line.startswith(("表 ", "注：", "机构类别", "指标", "指 标", "病名", "202")):
            continue
        if line in {"次）", "人次）"}:
            continue
        if any(marker in line for marker in header_markers):
            continue
        _, vals = current_values(line, value_count)
        if vals:
            rows.append(f"{pending} {line}" if pending else line)
            pending = None
        elif not tokens(line) and len(line) < 26:
            pending = line
    return rows


def clean_label(label):
    return label.replace("医院中：", "").replace("合计中：", "").replace("机构类别", "").strip()


def bad_indicator(indicator):
    return bool(re.search(r"[一二三四五六七八九十]、|见表|比上年|增加|减少|比较|注：", indicator))


records = []
seen = set()


def add(year, subcategory, indicator, value, unit, note="国家卫健委统计公报扩展指标抽取；2022-2024年PDF表格结构化"):
    if value is None:
        return
    indicator = indicator.strip()
    if not indicator or re.match(r"^[，,。；;）)]", indicator):
        return
    if bad_indicator(indicator):
        return
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    key = (year, indicator)
    if key in seen:
        return
    seen.add(key)
    records.append(
        {
            "region_code": "000000",
            "region": "全国",
            "level": "国家",
            "year": year,
            "category": "卫生健康",
            "subcategory": subcategory,
            "indicator": indicator,
            "nature": "实际值",
            "value": value,
            "unit": unit,
            "yoy": "",
            "deadline": "",
            "responsible": "国家卫生健康委",
            "source": f"{year}年我国卫生健康事业发展统计公报",
            "doc_no": "—（公开统计公报）",
            "source_url": SOURCE_URLS[year],
            "note": note,
            "compare_key": indicator,
            "region_tier": "1·全国",
        }
    )


def add_table_1(year, lines):
    for row in compact_rows(table_lines(lines, 1), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        label = clean_label(label)
        if "政府办" in label:
            continue
        base = "医疗卫生机构" if label == "总计" else label
        add(year, "卫生资源", f"{base}数", vals[1], "个")
        if vals[3] is not None:
            add(year, "床位资源", f"{base}床位数", round(vals[3] / 10000, 2), "万张")


def add_table_2(year, lines):
    unit_by_base = {
        "每千人口执业（助理）医师": "人",
        "每万人口全科医生": "人",
        "每千人口注册护士": "人",
        "每千人口药师（士）": "人",
        "每万人口专业公共卫生机构人员": "人",
    }
    for row in compact_rows(table_lines(lines, 2), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        base = re.sub(r"（.*?）", "", clean_label(label))
        unit = unit_by_base.get(base, "万人")
        indicator = base if unit != "万人" or base.endswith(("数", "人员")) else f"{base}数"
        add(year, "卫生人员", indicator, vals[1], unit)


def add_table_3(year, lines):
    for row in compact_rows(table_lines(lines, 3), 4):
        label, vals = current_values(row, 4)
        if not label or label == "总计":
            continue
        base = clean_label(label)
        add(year, "卫生人员", f"{base}人员数", vals[1], "万人")
        add(year, "卫生人员", f"{base}卫生技术人员数", vals[3], "万人")


def add_table_4(year, lines):
    for row in compact_rows(table_lines(lines, 4), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        base = clean_label(label)
        if "构成" in base:
            continue
        indicator = re.sub(r"（.*?）", "", base)
        unit = "%" if "比重" in indicator else "元" if "人均" in indicator else "亿元"
        add(year, "卫生费用", indicator, vals[1], unit)


def add_table_5(year, lines):
    for row in compact_rows(table_lines(lines, 5), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        base = clean_label(label)
        add(year, "医疗服务", f"{base}诊疗人次", vals[1], "亿人次")
        add(year, "医疗服务", f"{base}入院人次", vals[3], "万人次")


def add_table_6(year, lines):
    for row in compact_rows(table_lines(lines, 6), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        base = clean_label(label)
        add(year, "医院运行", f"{base}医师日均担负诊疗人次", vals[1], "人次")
        add(year, "医院运行", f"{base}医师日均担负住院床日", vals[3], "床日")


def add_table_7(year, lines):
    allowed = {"医院", "公立医院", "民营医院", "三级医院", "二级医院", "一级医院"}
    for row in compact_rows(table_lines(lines, 7), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        base = clean_label(label)
        if base not in allowed:
            continue
        add(year, "医院运行", f"{base}病床使用率", vals[1], "%")
        add(year, "医院运行", f"{base}出院者平均住院日", vals[3], "日")


def add_table_8(year, lines):
    unit_map = {
        "乡镇卫生院数": "个",
        "床位数": "万张",
        "卫生人员数": "万人",
        "卫生技术人员": "万人",
        "执业（助理）医师": "万人",
        "诊疗人次": "亿人次",
        "入院人次数": "万人次",
        "医师日均担负诊疗人次": "人次",
        "医师日均担负住院床日": "床日",
        "病床使用率": "%",
        "出院者平均住院日": "日",
    }
    for row in compact_rows(table_lines(lines, 8), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        indicator = re.sub(r"（.*?）", "", clean_label(label))
        if indicator not in unit_map:
            continue
        if indicator != "乡镇卫生院数":
            indicator = f"乡镇卫生院{indicator}"
        add(year, "基层卫生服务", indicator, vals[1], unit_map.get(indicator.replace("乡镇卫生院", ""), unit_map.get(indicator, "")))


def add_table_9(year, lines):
    units = {
        "村卫生室数": "万个",
        "人员总数": "万人",
        "执业（助理）医师和持乡村医生证的人员": "万人",
        "注册护士": "万人",
        "卫生员": "万人",
    }
    for row in compact_rows(table_lines(lines, 9), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        indicator = re.sub(r"（.*?）", "", clean_label(label))
        if indicator not in units:
            continue
        base_indicator = indicator
        if not indicator.startswith("村卫生室"):
            indicator = f"村卫生室{indicator}"
        add(year, "基层卫生服务", indicator, vals[1], units[base_indicator])


def add_table_10(year, lines):
    unit_map = {
        "社区卫生服务中心数": "个",
        "社区卫生服务站数": "个",
        "床位数": "张",
        "卫生人员数": "万人",
        "卫生技术人员": "万人",
        "执业（助理）医师": "万人",
        "诊疗人次": "亿人次",
        "入院人次数": "万人次",
        "医师日均担负诊疗人次": "人次",
        "医师日均担负住院床日": "床日",
        "病床使用率": "%",
        "出院者平均住院日": "日",
    }
    for row in compact_rows(table_lines(lines, 10), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        indicator = re.sub(r"（.*?）", "", clean_label(label))
        if indicator not in unit_map:
            continue
        if not indicator.startswith("社区"):
            indicator = f"社区卫生服务{indicator}"
        add(year, "基层卫生服务", indicator, vals[1], unit_map.get(indicator.replace("社区卫生服务", ""), unit_map.get(indicator, "")))


def add_table_11(year, lines):
    for row in compact_rows(table_lines(lines, 11), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        base = "中医类医疗卫生机构" if clean_label(label) == "总计" else clean_label(label)
        add(year, "中医药服务", f"{base}数", vals[1], "个")
        if vals[3] is not None:
            add(year, "中医药服务", f"{base}床位数", round(vals[3] / 10000, 2), "万张")


def add_table_12(year, lines):
    allowed = {"社区卫生服务中心", "社区卫生服务站", "乡镇卫生院", "村卫生室"}
    for row in compact_rows(table_lines(lines, 12), 2):
        label, vals = current_values(row, 2)
        base = clean_label(label or "")
        if base in allowed:
            add(year, "中医药服务", f"提供中医服务的{base}占比", vals[1], "%")


def add_table_13(year, lines):
    for row in compact_rows(table_lines(lines, 13), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        indicator = re.sub(r"（.*?）", "", clean_label(label))
        unit = "%" if "比例" in indicator or "占" in indicator else "万人"
        add(year, "中医药服务", indicator, vals[1], unit)


def add_table_14(year, lines):
    allowed = {
        "中医类总计",
        "中医类医院",
        "中医医院",
        "中西医结合医院",
        "民族医医院",
        "中医类门诊部",
        "中医门诊部",
        "中西医结合门诊部",
        "民族医门诊部",
        "中医类诊所",
        "中医诊所",
        "中西医结合诊所",
        "民族医诊所",
        "非中医类医疗卫生机构中医类临床科室",
    }
    for row in compact_rows(table_lines(lines, 14), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        base = clean_label(label)
        if base == "室":
            base = "非中医类医疗卫生机构中医类临床科室"
        if base not in allowed:
            continue
        add(year, "中医药服务", f"{base}诊疗人次", vals[1], "万人次")
        add(year, "中医药服务", f"{base}出院人次", vals[3], "万人次")


def add_table_17_18(year, lines, table_no, subcategory, prefix):
    for row in compact_rows(table_lines(lines, table_no), 4):
        label, vals = current_values(row, 4)
        if not label:
            continue
        base = "合计" if clean_label(label) == "总计" else clean_label(label)
        add(year, subcategory, f"{prefix}{base}报告发病例数", vals[1], "例")
        add(year, subcategory, f"{prefix}{base}报告死亡人数", vals[3], "人")


def add_table_19(year, lines):
    for row in compact_rows(table_lines(lines, 19), 2):
        label, vals = current_values(row, 2)
        if not label:
            continue
        label = clean_label(label)
        if label == "市":
            indicator = "城市住院分娩率"
        elif label == "县":
            indicator = "县域住院分娩率"
        else:
            indicator = re.sub(r"（.*?）", "", label)
        add(year, "妇幼与公共卫生", indicator, vals[1], "%")


def add_table_20(year, lines):
    for row in compact_rows(table_lines(lines, 20), 6):
        label, vals = current_values(row, 6)
        if not label:
            continue
        base = re.sub(r"（.*?）", "", clean_label(label))
        unit = "1/10万" if "孕产妇" in base else "‰"
        add(year, "健康结果", f"{base}(合计)", vals[1], unit)
        add(year, "健康结果", f"{base}(城市)", vals[3], unit)
        add(year, "健康结果", f"{base}(农村)", vals[5], unit)


BODY_SPEC = [
    ("卫生资源", "三级甲等医院数", "个", r"三级甲等医院\s*([0-9.]+)\s*个"),
    ("卫生资源", "100张以下床位医院数", "个", r"100\s*张以下床位医院\s*([0-9.]+)\s*个"),
    ("卫生资源", "100-199张床位医院数", "个", r"100[～~-]\s*199\s*张床位医院\s*([0-9.]+)\s*个"),
    ("卫生资源", "200-499张床位医院数", "个", r"200[～~-]\s*499\s*张床位医院\s*([0-9.]+)\s*个"),
    ("卫生资源", "500-799张床位医院数", "个", r"500[～~-]\s*799\s*张床位医院\s*([0-9.]+)\s*个"),
    ("卫生资源", "800张及以上床位医院数", "个", r"800\s*张及以上床位医院\s*([0-9.]+)\s*个"),
    ("床位资源", "公立医院床位占比", "%", r"公立医院床位占\s*([0-9.]+)%"),
    ("床位资源", "民营医院床位占比", "%", r"民营医院床位占\s*([0-9.]+)%"),
    ("医疗服务", "居民平均就诊次数", "次", r"居民平均到医疗卫生机构就诊\s*([0-9.]+)\s*次"),
    ("医疗服务", "居民年住院率", "%", r"居民年住院率为\s*([0-9.]+)%"),
    ("医疗质量与服务", "二级及以上公立医院开展预约诊疗比例", "%", r"([0-9.]+)%开展(?:了)?预约诊疗"),
    ("医疗质量与服务", "二级及以上公立医院开展临床路径管理比例", "%", r"([0-9.]+)%开展临床路径管理"),
    ("医疗质量与服务", "二级及以上公立医院开展远程医疗服务比例", "%", r"([0-9.]+)%开展远程医疗服务"),
    ("医疗质量与服务", "二级及以上公立医院参与检查结果互认比例", "%", r"([0-9.]+)%参与同级检查结果互认"),
    ("医疗质量与服务", "二级及以上公立医院开展优质护理服务比例", "%", r"([0-9.]+)%开展优\s*质护理服务"),
    ("医疗质量与服务", "无偿献血人次数", "万人次", r"无偿献血人次数(?:达到)?\s*([0-9.]+)\s*万"),
    ("医疗质量与服务", "献血量", "万单位", r"献血量\s*([0-9.]+)\s*万单位"),
    ("医疗质量与服务", "千人口献血率", "‰", r"千人口献血率\s*([0-9.]+)"),
    ("健康结果", "人均预期寿命", "岁", r"人均预期寿命达到\s*([0-9.]+)\s*岁"),
    ("妇幼与公共卫生", "免费孕前优生健康检查人数", "万人", r"全国共为\s*([0-9.]+)\s*万名计划怀孕夫妇提供免费检查"),
    ("妇幼与公共卫生", "免费孕前优生目标人群覆盖率", "%", r"目标人群覆盖率平均达\s*([0-9.]+)%"),
]


def add_body_specs(year, text):
    for subcategory, indicator, unit, pattern in BODY_SPEC:
        match = re.search(pattern, text)
        if match:
            add(year, subcategory, indicator, float(match.group(1)), unit, "国家卫健委统计公报扩展指标抽取；正文稳定字段补充")


for year in (2022, 2023, 2024):
    lines = pdf_lines(year)
    text = " ".join(lines)
    add_table_1(year, lines)
    add_table_2(year, lines)
    add_table_3(year, lines)
    add_table_4(year, lines)
    add_table_5(year, lines)
    add_table_6(year, lines)
    add_table_7(year, lines)
    add_table_8(year, lines)
    add_table_9(year, lines)
    add_table_10(year, lines)
    add_table_11(year, lines)
    add_table_12(year, lines)
    add_table_13(year, lines)
    add_table_14(year, lines)
    add_table_17_18(year, lines, 17, "疾病控制与公共卫生", "甲乙类传染病")
    add_table_17_18(year, lines, 18, "疾病控制与公共卫生", "丙类传染病")
    add_table_19(year, lines)
    add_table_20(year, lines)
    add_body_specs(year, text)

records.sort(key=lambda r: (r["subcategory"], r["indicator"], r["year"]))
OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
summary = {"records": len(records), "indicators": len({r["indicator"] for r in records}), "years": [2022, 2023, 2024]}
print(json.dumps(summary, ensure_ascii=False))
