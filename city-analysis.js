const core = ["GDP", "人均GDP", "年末常住人口", "年末户籍人口", "城镇化率(常住)", "地方一般公共预算收入", "地方一般公共预算支出"];
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const controls = ["#year", "#city", "#exportSvg", "#exportCsv", "#exportSummary"].map($);
controls.forEach((control) => { control.disabled = true; });

let pack;
let coverage;
let rows = [];
let exportRows = [];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`);
  return response.json();
}

function polar(index, radius) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / core.length;
  return [250 + Math.cos(angle) * radius, 205 + Math.sin(angle) * radius];
}

function buildMetric(metric, yearly, cityRows) {
  const peers = yearly
    .filter((row) => row.compare_key === metric && Number.isFinite(+row.value))
    .sort((a, b) => +b.value - +a.value || a.region.localeCompare(b.region, "zh-Hans"));
  const row = cityRows.get(metric);
  if (!row) return { metric, row: null, rank: null, total: peers.length, normalized: 0 };
  const values = peers.map((item) => +item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    metric,
    row,
    rank: 1 + peers.filter((item) => +item.value > +row.value).length,
    total: peers.length,
    normalized: max === min ? 0.5 : (+row.value - min) / (max - min),
  };
}

function draw() {
  const year = +$("#year").value;
  const city = $("#city").value;
  const yearly = rows.filter((row) => +row.year === year);
  const cityRows = new Map(yearly.filter((row) => row.region === city).map((row) => [row.compare_key, row]));
  exportRows = core.map((metric) => buildMetric(metric, yearly, cityRows));
  const rings = [0.25, 0.5, 0.75, 1].map((ratio) => `<polygon class="axis" points="${core.map((_, index) => polar(index, 150 * ratio).join(",")).join(" ")}"/>`).join("");
  const axes = core.map((metric, index) => {
    const [x, y] = polar(index, 178);
    const [x2, y2] = polar(index, 150);
    return `<line class="axis" x1="250" y1="205" x2="${x2}" y2="${y2}"/><text x="${x}" y="${y}" text-anchor="middle" font-size="12">${esc(metric)}</text>`;
  }).join("");
  const title = `${city} ${year} 年核心指标同年标准化雷达图`;
  $("#radar").setAttribute("aria-label", title);
  $("#radar").innerHTML = `<title>${esc(title)}</title><desc>七项指标按同年副省级城市最小值和最大值标准化到零至一。</desc>${rings}${axes}<polygon class="shape" points="${exportRows.map((item, index) => polar(index, item.normalized * 150).join(",")).join(" ")}"/>`;
  $("#ranking").innerHTML = exportRows.map((item) => `<tr><td>${esc(item.metric)}</td><td>${item.row ? `${esc(item.row.value)} ${esc(item.row.unit)}` : "—"}</td><td>${item.rank ? `${item.rank}/${item.total}` : "—"}</td><td>${(item.normalized * 100).toFixed(1)}</td></tr>`).join("");
  $("#status").textContent = `${city} · ${year}：${exportRows.filter((item) => item.row).length}/${core.length} 项实际值；按需数据包 ${pack.rows.length} 条。`;
}

function download(name, content, type) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

function renderHeatmap() {
  $("#heat").innerHTML = `<b>城市</b>${coverage.definition.recent_years.map((year) => `<b>${year}</b>`).join("")}${coverage.cities.map((city) => `<b>${esc(city.city)}</b>${coverage.definition.recent_years.map((year) => {
    const count = city.by_year[year] || 0;
    return `<span class="${count === 7 ? "" : "gap"}" aria-label="${esc(city.city)} ${year} 年覆盖 ${count}/7 项" title="${esc(city.city)} ${year}：${count}/7">${count}/7</span>`;
  }).join("")}`).join("")}`;
}

async function init() {
  [pack, coverage] = await Promise.all([
    fetchJson("data/packs/subprov-core.json"),
    fetchJson("data/coverage-report.json"),
  ]);
  if (!Array.isArray(pack.rows) || !Array.isArray(coverage.cities)) throw new Error("数据包结构不符合预期");
  rows = pack.rows.filter((row) => row.nature === "实际值" && core.includes(row.compare_key));
  const cities = [...new Set(rows.map((row) => row.region))].sort((a, b) => a.localeCompare(b, "zh-Hans"));
  $("#city").innerHTML = cities.map((city) => `<option${city === "大连市" ? " selected" : ""}>${esc(city)}</option>`).join("");
  renderHeatmap();
  controls.forEach((control) => { control.disabled = false; });
  [$("#year"), $("#city")].forEach((control) => control.addEventListener("change", draw));
  $("#exportSvg").addEventListener("click", () => download(`city-radar-${$("#city").value}-${$("#year").value}.svg`, new XMLSerializer().serializeToString($("#radar")), "image/svg+xml"));
  $("#exportCsv").addEventListener("click", () => download(`city-ranking-${$("#city").value}-${$("#year").value}.csv`, `\uFEFF指标,实值,单位,排名,可比城市数,标准化,来源\n${exportRows.map((item) => [item.metric, item.row?.value ?? "", item.row?.unit ?? "", item.rank ?? "", item.total, (item.normalized * 100).toFixed(1), item.row?.source_url ?? ""].map(csvCell).join(",")).join("\n")}`, "text/csv"));
  $("#exportSummary").addEventListener("click", () => download(`city-analysis-${$("#city").value}-${$("#year").value}.md`, `# ${$("#city").value} ${$("#year").value} 年实值分析\n\n> 同年副省级城市 Min-Max 标准化，不代表官方综合评价。\n\n${exportRows.map((item) => `- ${item.metric}：${item.row ? `${item.row.value}${item.row.unit}，排名 ${item.rank}/${item.total}，[来源](${item.row.source_url})` : "缺失"}`).join("\n")}\n`, "text/markdown"));
  draw();
}

init().catch((error) => {
  $("#status").textContent = `数据加载失败：${error.message}。请刷新页面或稍后重试。`;
  $("#status").classList.add("error");
  console.error(error);
});
