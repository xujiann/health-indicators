const core = ["GDP", "人均GDP", "年末常住人口", "年末户籍人口", "城镇化率(常住)", "地方一般公共预算收入", "地方一般公共预算支出"];
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const [pack, coverage] = await Promise.all([fetch("data/packs/subprov-core.json").then((r) => r.json()), fetch("data/coverage-report.json").then((r) => r.json())]);
const rows = pack.rows.filter((row) => row.nature === "实际值" && core.includes(row.compare_key));
const cities = [...new Set(rows.map((row) => row.region))].sort((a, b) => a.localeCompare(b, "zh-Hans"));
$("#city").innerHTML = cities.map((city) => `<option${city === "大连市" ? " selected" : ""}>${esc(city)}</option>`).join("");
const polar = (index, radius) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / core.length; return [250 + Math.cos(angle) * radius, 205 + Math.sin(angle) * radius]; };
let exportRows = [];
function draw() {
  const year = +$("#year").value, city = $("#city").value, yearly = rows.filter((row) => +row.year === year);
  const cityRows = new Map(yearly.filter((row) => row.region === city).map((row) => [row.compare_key, row]));
  exportRows = core.map((metric) => { const peers = yearly.filter((row) => row.compare_key === metric && Number.isFinite(+row.value)).sort((a, b) => +b.value - +a.value); const row = cityRows.get(metric); const values = peers.map((item) => +item.value), min = Math.min(...values), max = Math.max(...values); return { metric, row, rank: row ? peers.findIndex((item) => item.region === city) + 1 : null, total: peers.length, normalized: row ? (+row.value - min) / (max - min || 1) : 0 }; });
  const rings = [0.25, .5, .75, 1].map((ratio) => `<polygon class="axis" points="${core.map((_, i) => polar(i, 150 * ratio).join(",")).join(" ")}"/>`).join("");
  const axes = core.map((metric, i) => { const [x, y] = polar(i, 178), [x2, y2] = polar(i, 150); return `<line class="axis" x1="250" y1="205" x2="${x2}" y2="${y2}"/><text x="${x}" y="${y}" text-anchor="middle" font-size="12">${esc(metric)}</text>`; }).join("");
  $("#radar").innerHTML = `${rings}${axes}<polygon class="shape" points="${exportRows.map((item, i) => polar(i, item.normalized * 150).join(",")).join(" ")}"/>`;
  $("#ranking").innerHTML = exportRows.map((item) => `<tr><td>${esc(item.metric)}</td><td>${item.row ? `${esc(item.row.value)} ${esc(item.row.unit)}` : "—"}</td><td>${item.rank ? `${item.rank}/${item.total}` : "—"}</td><td>${(item.normalized * 100).toFixed(1)}</td></tr>`).join("");
  $("#status").textContent = `${city} · ${year}：${exportRows.filter((item) => item.row).length}/${core.length} 项实际值；按需数据包 ${pack.rows.length} 条。`;
}
function download(name, content, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); }
$("#exportSvg").onclick = () => download(`city-radar-${$("#city").value}-${$("#year").value}.svg`, new XMLSerializer().serializeToString($("#radar")), "image/svg+xml");
$("#exportCsv").onclick = () => download(`city-ranking-${$("#city").value}-${$("#year").value}.csv`, `\uFEFF指标,实值,单位,排名,可比城市数,标准化\n${exportRows.map((item) => [item.metric, item.row?.value || "", item.row?.unit || "", item.rank || "", item.total, (item.normalized * 100).toFixed(1)].join(",")).join("\n")}`, "text/csv");
$("#exportSummary").onclick = () => download(`city-analysis-${$("#city").value}-${$("#year").value}.md`, `# ${$("#city").value} ${$("#year").value} 年实值分析\n\n${exportRows.map((item) => `- ${item.metric}：${item.row ? `${item.row.value}${item.row.unit}，排名 ${item.rank}/${item.total}` : "缺失"}`).join("\n")}\n`, "text/markdown");
[$("#year"), $("#city")].forEach((control) => control.addEventListener("change", draw));
$("#heat").innerHTML = `<b>城市</b>${coverage.definition.recent_years.map((year) => `<b>${year}</b>`).join("")}${coverage.cities.map((city) => `<b>${esc(city.city)}</b>${coverage.definition.recent_years.map((year) => `<span class="${city.by_year[year] === 7 ? "" : "gap"}">${city.by_year[year]}/7</span>`).join("")}`).join("")}`;
draw();
