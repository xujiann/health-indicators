import { buildCityMatrix, buildCityRanking, buildInsurancePairs, buildTrend, buildYearChanges, formatNumber } from "./insights-core.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const percent = (value) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
const signed = (value, unit = "") => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${formatNumber(value)}${unit}` : "—";
const sourceLink = (row, label = "原文") => row?.source_url ? `<a href="${esc(row.source_url)}" target="_blank" rel="noopener">${esc(label)}</a>` : "—";

async function loadRows(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = await response.json();
  return payload.rows || [];
}

function setError(error) {
  const status = $("#status");
  if (status) {
    status.classList.add("error");
    status.textContent = `数据加载失败（${error.message}）。请刷新页面或稍后重试。`;
  }
  document.querySelectorAll("select,button").forEach((control) => { control.disabled = true; });
}

function trendSvg(series) {
  if (!series.length) return "";
  const width = 980, height = 390, left = 72, right = 28, top = 34, bottom = 54;
  const values = series.map((row) => row.value);
  let min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min || Math.max(Math.abs(max), 1)) * .12;
  min -= pad; max += pad;
  const x = (index) => left + index * (width - left - right) / Math.max(series.length - 1, 1);
  const y = (value) => top + (max - value) * (height - top - bottom) / (max - min || 1);
  const points = series.map((row, index) => `${x(index)},${y(row.value)}`).join(" ");
  const area = `${left},${height - bottom} ${points} ${x(series.length - 1)},${height - bottom}`;
  const grids = Array.from({ length: 5 }, (_, index) => {
    const gy = top + index * (height - top - bottom) / 4;
    const value = max - index * (max - min) / 4;
    return `<line class="gridline" x1="${left}" x2="${width - right}" y1="${gy}" y2="${gy}"/><text class="axistext" x="${left - 10}" y="${gy + 4}" text-anchor="end">${formatNumber(value, 1)}</text>`;
  }).join("");
  const labels = series.map((row, index) => index % Math.max(1, Math.ceil(series.length / 8)) === 0 || index === series.length - 1 ? `<text class="axistext" x="${x(index)}" y="${height - 21}" text-anchor="middle">${row.year}</text>` : "").join("");
  const dots = series.map((row, index) => `<circle class="dot" cx="${x(index)}" cy="${y(row.value)}" r="5"><title>${row.year}年：${formatNumber(row.value)}${esc(row.unit)}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series[0].compare_key)}年度趋势"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2f75b5" stop-opacity=".32"/><stop offset="1" stop-color="#2f75b5" stop-opacity=".03"/></linearGradient></defs>${grids}<polygon class="area" points="${area}"/><polyline id="trendPath" class="series" points="${points}"/>${dots}${labels}</svg>`;
}

async function initTrend() {
  const rows = await loadRows("data/packs/national-health.json");
  const preferred = ["每千人口医疗卫生机构床位数", "每千人口执业(助理)医师数", "每千人口注册护士数", "总诊疗人次", "卫生总费用", "人均卫生总费用", "医疗卫生机构实有床位数"];
  const metrics = preferred.filter((key) => buildTrend(rows, key).length >= 10);
  $("#metric").innerHTML = metrics.map((metric) => `<option>${esc(metric)}</option>`).join("");
  const render = () => {
    const series = buildTrend(rows, $("#metric").value);
    const first = series[0], last = series.at(-1);
    const total = first?.value ? (last.value - first.value) / Math.abs(first.value) * 100 : null;
    $("#latest").textContent = last ? `${formatNumber(last.value)} ${last.unit}` : "—";
    $("#span").textContent = series.length ? `${first.year}—${last.year}` : "—";
    $("#totalChange").textContent = percent(total);
    $("#totalChange").className = total >= 0 ? "up" : "down";
    $("#trendChart").innerHTML = trendSvg(series);
    $("#trendTable").innerHTML = series.map((row, index) => {
      const previous = series[index - 1];
      const yoy = previous?.value ? (row.value - previous.value) / Math.abs(previous.value) * 100 : null;
      return `<tr><td>${row.year}</td><td>${formatNumber(row.value)} ${esc(row.unit)}</td><td class="${yoy >= 0 ? "up" : "down"}">${index ? percent(yoy) : "—"}</td><td>${sourceLink(row)}</td></tr>`;
    }).join("");
    $("#status").textContent = `已加载 ${series.length} 个年度实际值；数据源为国家卫生健康委公开统计公报。`;
  };
  $("#metric").addEventListener("change", render);
  render();
}

async function initCity() {
  const [rows, reportResponse] = await Promise.all([loadRows("data/packs/subprov-core.json"), fetch("data/coverage-report.json")]);
  if (!reportResponse.ok) throw new Error(`${reportResponse.status} ${reportResponse.statusText}`);
  const report = await reportResponse.json();
  const metrics = report.definition.core_metrics;
  const years = [2023, 2024, 2025];
  const exceptions = new Map((report.resolved_exceptions || []).map((item) => [`${item.city}|${item.year}|${item.compare_key}`, item]));
  $("#cityMetric").innerHTML = metrics.map((metric) => `<option>${esc(metric)}</option>`).join("");
  const showDetail = (cell, metric) => {
    if (cell.row) {
      $("#cityDetail").innerHTML = `<strong>${esc(cell.city)} · ${cell.year} · ${esc(metric)}</strong><br>${formatNumber(cell.value)} ${esc(cell.row.unit)} · ${sourceLink(cell.row, esc(cell.row.source || "查看原文"))}`;
      return;
    }
    const exception = exceptions.get(`${cell.city}|${cell.year}|${metric}`);
    $("#cityDetail").innerHTML = `<strong>${esc(cell.city)} · ${cell.year} · ${esc(metric)}</strong><br><span class="down">无同口径实值，不按 0 处理。</span>${exception ? ` ${esc(exception.reason)} ${sourceLink(exception, "核验来源")}` : ""}`;
  };
  const render = () => {
    const metric = $("#cityMetric").value;
    const year = Number($("#cityYear").value);
    const matrix = buildCityMatrix(rows, metric, years);
    $("#cityMatrix").innerHTML = `<div class="head">城市</div>${years.map((item) => `<div class="head">${item}</div>`).join("")}` + matrix.map((entry) => `<div class="head">${esc(entry.city)}</div>${entry.cells.map((cell) => cell.value === null ? `<button class="missing" data-city="${esc(cell.city)}" data-year="${cell.year}">已核验无值</button>` : `<button data-city="${esc(cell.city)}" data-year="${cell.year}" style="background:hsl(${210 - (cell.score ?? .5) * 35} 60% ${96 - (cell.score ?? .5) * 31}%)">${formatNumber(cell.value)} ${esc(cell.row.unit)}</button>`).join("")}`).join("");
    const flat = matrix.flatMap((entry) => entry.cells);
    $("#cityMatrix").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => showDetail(flat.find((cell) => cell.city === button.dataset.city && cell.year === Number(button.dataset.year)), metric)));
    const ranking = buildCityRanking(rows, metric, year);
    $("#rankingTitle").textContent = `${year} 年 ${metric}城市排名`;
    $("#cityRanking").innerHTML = ranking.length ? ranking.map((row) => `<tr><td>${row.rank}</td><td>${esc(row.region)}</td><td>${formatNumber(row.value)} ${esc(row.unit)}</td><td>${sourceLink(row)}</td></tr>`).join("") : `<tr><td colspan="4">该年度暂无可排名实值。</td></tr>`;
    const missing = matrix.flatMap((entry) => entry.cells).filter((cell) => cell.value === null).length;
    $("#status").textContent = `已加载 ${matrix.length} 个城市、${years.length} 个年度；当前矩阵 ${missing} 格无同口径实值，均保留为空。`;
    const selected = matrix.flatMap((entry) => entry.cells).find((cell) => cell.year === year && cell.value !== null) || matrix[0]?.cells[0];
    if (selected) showDetail(selected, metric);
  };
  $("#cityMetric").addEventListener("change", render);
  $("#cityYear").addEventListener("change", render);
  render();
}

async function initChange() {
  const rows = await loadRows("data/packs/national-health.json");
  const categories = [...new Set(rows.filter((row) => Number(row.year) === 2025).map((row) => row.subcategory))].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"));
  $("#subcategory").innerHTML = categories.map((category) => `<option${category === "疾病控制与公共卫生" ? " selected" : ""}>${esc(category)}</option>`).join("");
  const render = () => {
    const category = $("#subcategory").value;
    const changes = buildYearChanges(rows, category);
    const limit = Number($("#changeLimit").value);
    $("#comparable").textContent = changes.length;
    $("#increase").textContent = changes.filter((item) => item.change > 0).length;
    $("#decrease").textContent = changes.filter((item) => item.change < 0).length;
    $("#changeList").innerHTML = changes.slice(0, limit).map((item) => {
      const low = Math.min(item.fromValue, item.toValue), high = Math.max(item.fromValue, item.toValue);
      const spread = Math.max(Math.abs(high), 1) * .18;
      const min = Math.min(0, low - spread), max = high + spread;
      const pos = (value) => (value - min) / (max - min) * 100;
      const a = pos(item.fromValue), b = pos(item.toValue);
      return `<div class="change-row"><div><strong>${esc(item.key)}</strong><br><span class="muted">${formatNumber(item.fromValue)} → ${formatNumber(item.toValue)} ${esc(item.unit)}</span></div><div class="track"><span class="stem" style="left:${Math.min(a,b)}%;width:${Math.abs(b-a)}%"></span><i class="from" style="left:${a}%" title="2024：${formatNumber(item.fromValue)}"></i><i class="to" style="left:${b}%" title="2025：${formatNumber(item.toValue)}"></i></div><div class="delta ${item.change >= 0 ? "up" : "down"}">${percent(item.percent)}<br><small>${signed(item.change, item.unit)}</small></div></div>`;
    }).join("") || `<p class="muted">该分类没有可按同名同单位匹配的 2024—2025 指标。</p>`;
    $("#status").textContent = `“${category}”共匹配 ${changes.length} 项同口径指标，按变化幅度绝对值排序。`;
  };
  $("#subcategory").addEventListener("change", render);
  $("#changeLimit").addEventListener("change", render);
  render();
}

async function initInsurance() {
  const rows = await loadRows("data/packs/medical-insurance.json");
  const pairs = buildInsurancePairs(rows);
  const metrics = [...new Set(pairs.map((pair) => pair.base))];
  $("#insuranceMetric").innerHTML = metrics.map((metric) => `<option${metric === "基本医疗保险参保人数" ? " selected" : ""}>${esc(metric)}</option>`).join("");
  const render = () => {
    const metric = $("#insuranceMetric").value;
    const selected = pairs.filter((pair) => pair.base === metric);
    const max = Math.max(...selected.flatMap((pair) => [pair.quick.value, pair.annual.value]), 1);
    $("#insuranceBars").innerHTML = selected.map((pair) => `<div class="bar-row"><strong>${pair.year}</strong><div class="bar-pair"><div class="bar quick" style="width:${pair.quick.value/max*100}%">快报 ${formatNumber(pair.quick.value)} ${esc(pair.unit)}</div><div class="bar annual" style="width:${pair.annual.value/max*100}%">公报 ${formatNumber(pair.annual.value)} ${esc(pair.unit)}</div></div></div>`).join("");
    $("#insuranceTable").innerHTML = selected.map((pair) => `<tr><td>${pair.year}</td><td>${sourceLink(pair.quick, `${formatNumber(pair.quick.value)} ${pair.unit}`)}</td><td>${sourceLink(pair.annual, `${formatNumber(pair.annual.value)} ${pair.unit}`)}</td><td class="${pair.difference >= 0 ? "up" : "down"}">${signed(pair.difference, pair.unit)}</td><td class="${pair.percent >= 0 ? "up" : "down"}">${percent(pair.percent)}</td></tr>`).join("");
    $("#status").textContent = `已找到“${metric}”${selected.length} 个年度的快报—年度公报可比对。`;
  };
  $("#insuranceMetric").addEventListener("change", render);
  render();
}

const initializers = { trend: initTrend, city: initCity, change: initChange, insurance: initInsurance };
initializers[document.body.dataset.view]?.().catch(setError);

