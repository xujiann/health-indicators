const numberValue = (value) => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function actualRows(rows = []) {
  return rows.filter((row) => row.nature === "实际值" && numberValue(row.value) !== null);
}

export function buildTrend(rows, compareKey) {
  const candidates = actualRows(rows)
    .filter((row) => row.compare_key === compareKey)
    .sort((a, b) => Number(a.year) - Number(b.year));
  const unit = candidates[0]?.unit || "";
  return candidates.filter((row) => row.unit === unit).map((row) => ({ ...row, value: numberValue(row.value) }));
}

export function buildCityMatrix(rows, metric, years = [2023, 2024, 2025]) {
  const selected = actualRows(rows).filter((row) => row.compare_key === metric && years.includes(Number(row.year)));
  const values = selected.map((row) => numberValue(row.value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const cities = [...new Set(rows.map((row) => row.region))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const byCell = new Map(selected.map((row) => [`${row.region}|${row.year}`, row]));
  return cities.map((city) => ({
    city,
    cells: years.map((year) => {
      const row = byCell.get(`${city}|${year}`);
      const value = row ? numberValue(row.value) : null;
      return { city, year, row, value, score: value === null || max === min ? null : (value - min) / (max - min) };
    }),
  }));
}

export function buildCityRanking(rows, metric, year) {
  return actualRows(rows)
    .filter((row) => row.compare_key === metric && Number(row.year) === Number(year))
    .map((row) => ({ ...row, value: numberValue(row.value) }))
    .sort((a, b) => b.value - a.value)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildYearChanges(rows, subcategory, fromYear = 2024, toYear = 2025) {
  const scoped = actualRows(rows).filter((row) => row.subcategory === subcategory && [fromYear, toYear].includes(Number(row.year)));
  const grouped = new Map();
  for (const row of scoped) {
    const key = `${row.compare_key}|${row.unit}`;
    if (!grouped.has(key)) grouped.set(key, {});
    grouped.get(key)[row.year] = row;
  }
  return [...grouped.values()].flatMap((pair) => {
    const from = pair[fromYear];
    const to = pair[toYear];
    if (!from || !to) return [];
    const fromValue = numberValue(from.value);
    const toValue = numberValue(to.value);
    if (fromValue === null || toValue === null) return [];
    const change = toValue - fromValue;
    return [{
      key: to.compare_key,
      unit: to.unit,
      from,
      to,
      fromValue,
      toValue,
      change,
      percent: fromValue === 0 ? null : change / Math.abs(fromValue) * 100,
    }];
  }).sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0));
}

const insuranceSuffix = /（(年度统计公报|统计快报)）$/;

export function buildInsurancePairs(rows) {
  const grouped = new Map();
  for (const row of actualRows(rows)) {
    const match = String(row.compare_key || "").match(insuranceSuffix);
    if (!match) continue;
    const base = row.compare_key.replace(insuranceSuffix, "");
    const key = `${base}|${row.unit}|${row.year}`;
    if (!grouped.has(key)) grouped.set(key, { base, unit: row.unit, year: Number(row.year) });
    grouped.get(key)[match[1] === "统计快报" ? "quick" : "annual"] = { ...row, value: numberValue(row.value) };
  }
  return [...grouped.values()].filter((pair) => pair.quick && pair.annual).map((pair) => ({
    ...pair,
    difference: pair.annual.value - pair.quick.value,
    percent: pair.quick.value === 0 ? null : (pair.annual.value - pair.quick.value) / Math.abs(pair.quick.value) * 100,
  })).sort((a, b) => a.base.localeCompare(b.base, "zh-CN") || a.year - b.year);
}

export function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(Number(value));
}

