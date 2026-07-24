(() => {
  const STORE = "health-indicators-basket-v1";
  const cache = new Map();
  const tabs = [["insights","自动洞察"],["knowledge","指标知识"],["trend","趋势构建"],["cities","城市画像"],["basket","对比篮"],["quality","数据质量"],["timeline","时间轴"],["updates","更新中心"],["topics","专题模板"]];
  let host, active = "insights", knowledge, timer, timeline = { index: 0, year: null }, trend = { index: 0, tier: "1", region: "" };
  const h = value => esc(value == null ? "" : value);
  const actual = rows => rows.filter(row => natKind(row.nature) === "actual" && numOf(row.value) != null && +row.year < 2030);
  const rowsNow = () => DATA.filter(row => baseFilter(row) && state.tiers.has(tierNo(row.region_tier)));
  const uniq = values => [...new Set(values)];
  const readBasket = () => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } };
  const writeBasket = items => localStorage.setItem(STORE, JSON.stringify(items.slice(0, 12)));
  const cardId = recs => encodeURIComponent(uniq(recs.map(row => row.compare_key)).sort().join("|"));

  window.workbenchButtons = (key, recs) => {
    const id = cardId(recs), saved = readBasket().some(item => item.id === id);
    cache.set(id, { id, key, recs, keys: uniq(recs.map(row => row.compare_key)), unit: recs[0]?.unit || "" });
    return '<button class="wb-icon" type="button" title="指标知识卡" data-wb-knowledge="' + id + '">i</button><button class="wb-icon' + (saved ? ' saved' : '') + '" type="button" title="加入对比篮" data-wb-save="' + id + '">' + (saved ? '★' : '☆') + '</button>';
  };

  function mount() {
    if (host) return;
    const actions = document.querySelector(".view-actions");
    if (actions) {
      const button = document.createElement("button");
      button.className = "actionbtn"; button.type = "button"; button.textContent = "分析"; button.title = "分析工作台";
      button.onclick = () => open("insights");
      actions.insertBefore(button, actions.firstChild);
    }
    host = document.createElement("section");
    host.className = "workbench"; host.id = "workbench"; host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    const style = document.createElement("style");
    style.textContent = ".wb-icon{width:28px;height:28px;border:1px solid var(--line);background:#fff;color:var(--brand);border-radius:6px;font:700 14px/1 Arial;cursor:pointer}.wb-icon:hover,.wb-icon.saved{background:var(--brand-soft);border-color:var(--brand)}.workbench{position:fixed;inset:0;z-index:30;background:rgba(21,35,51,.42);display:none;padding:24px;overflow:auto}.workbench.open{display:block}.wb-shell{max-width:1160px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 20px 60px rgba(15,30,45,.22);min-height:560px}.wb-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px 0}.wb-title{font-size:17px;font-weight:750;color:var(--ink)}.wb-close{width:32px;height:32px;border:0;background:#eef2f7;border-radius:6px;font-size:20px;cursor:pointer}.wb-tabs{display:flex;gap:3px;padding:14px 18px;border-bottom:1px solid var(--line);overflow:auto}.wb-tab{border:0;background:transparent;color:var(--ink2);font:600 13px/1 inherit;padding:8px 11px;white-space:nowrap;border-bottom:2px solid transparent;cursor:pointer}.wb-tab.on{color:var(--brand);border-color:var(--brand)}.wb-body{padding:18px}.wb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.wb-card{border:1px solid var(--line);border-radius:7px;padding:13px;background:#fff}.wb-card h3{font-size:13px;margin:0 0 7px}.wb-card p{margin:0;color:var(--ink2);font-size:12px;line-height:1.6}.wb-value{font-size:25px;font-weight:760;color:var(--brand);line-height:1.2}.wb-list{display:grid;gap:8px}.wb-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #edf1f5;padding:9px 0;font-size:13px}.wb-row:last-child{border-bottom:0}.wb-row small{display:block;color:var(--ink3);margin-top:3px}.wb-select{border:1px solid var(--line);border-radius:5px;background:#fff;padding:7px 9px;color:var(--ink);font:13px inherit;max-width:100%}.wb-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.wb-button{border:1px solid var(--brand);background:var(--brand);color:#fff;border-radius:5px;padding:7px 10px;font:600 12px inherit;cursor:pointer}.wb-button.light{background:#fff;color:var(--brand)}.wb-tag{display:inline-flex;background:var(--brand-soft);color:var(--brand);border-radius:4px;padding:3px 6px;font-size:11px;margin:2px}.wb-note{padding:10px 12px;background:#f5f8fb;color:var(--ink2);font-size:12px;line-height:1.6;border-left:3px solid #0d8a9c;margin-top:12px}.wb-link{color:var(--brand);text-decoration:none}.radar{width:100%;max-width:390px;height:300px;display:block;margin:auto}.radar text{font:11px Arial;fill:#617086}.radar .axis{stroke:#dce5ee;fill:none}.radar .a{fill:rgba(31,78,121,.16);stroke:#1f4e79;stroke-width:2}.radar .b{fill:rgba(196,71,61,.13);stroke:#c4473d;stroke-width:2}.timeline-row{display:grid;grid-template-columns:105px 1fr auto;gap:8px;align-items:center;font-size:12px}.timeline-row i{height:12px;background:#edf2f7;display:block;overflow:hidden}.timeline-row i b{display:block;height:100%;background:#0d8a9c}@media(max-width:760px){.workbench{padding:0}.wb-shell{border-radius:0;min-height:100vh}.wb-body{padding:14px}.timeline-row{grid-template-columns:82px 1fr auto}}";
    document.head.appendChild(style);
    const trendStyle = document.createElement("style");
    trendStyle.textContent = ".wb-levels{display:inline-flex;border:1px solid var(--line);border-radius:5px;overflow:hidden}.wb-level{border:0;border-right:1px solid var(--line);background:#fff;color:var(--ink2);padding:7px 10px;font:600 12px inherit;cursor:pointer}.wb-level:last-child{border-right:0}.wb-level.on{background:var(--brand);color:#fff}.trend-chart{width:100%;height:290px;display:block}.trend-legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;font-size:12px;color:var(--ink2)}.trend-legend span{display:inline-flex;align-items:center;gap:4px}.trend-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}";
    document.head.appendChild(trendStyle);
  }
  function open(tab, item) {
    mount(); active = tab; if (item) knowledge = item;
    host.classList.add("open"); host.setAttribute("aria-hidden", "false"); draw();
  }
  function close() { clearInterval(timer); timer = null; host.classList.remove("open"); host.setAttribute("aria-hidden", "true"); }
  function draw() {
    clearInterval(timer); timer = null;
    const panels = { insights: insightPanel, knowledge: knowledgePanel, trend: trendPanel, cities: cityPanel, basket: basketPanel, quality: qualityPanel, timeline: timelinePanel, updates: updatePanel, topics: topicPanel };
    host.innerHTML = '<div class="wb-shell"><div class="wb-head"><div class="wb-title">数据分析工作台</div><button class="wb-close" type="button" title="关闭">×</button></div><div class="wb-tabs">' + tabs.map(tab => '<button type="button" class="wb-tab' + (tab[0] === active ? ' on' : '') + '" data-wb-tab="' + tab[0] + '">' + tab[1] + '</button>').join("") + '</div><div class="wb-body">' + panels[active]() + '</div></div>';
    host.querySelector(".wb-close").onclick = close;
    host.querySelectorAll("[data-wb-tab]").forEach(button => button.onclick = () => { active = button.dataset.wbTab; draw(); });
    bind();
  }

  function changes(rows) {
    const groups = {};
    actual(rows).forEach(row => { const key = row.compare_key + "|" + row.region; (groups[key] ||= []).push(row); });
    return Object.values(groups).map(items => {
      const years = {}; items.forEach(row => { years[row.year] = row; });
      const points = Object.values(years).sort((a,b) => +a.year - +b.year);
      if (points.length < 2) return null;
      const last = points.at(-1), before = points.at(-2), base = numOf(before.value), value = numOf(last.value);
      return base && value != null ? { last, before, pct: (value-base) / Math.abs(base) * 100 } : null;
    }).filter(Boolean);
  }
  function insightPanel() {
    const rows = rowsNow(), list = changes(rows).sort((a,b) => Math.abs(b.pct)-Math.abs(a.pct)).slice(0,6);
    const years = rows.map(row => +row.year).filter(year => year && year < 2030);
    const linked = rows.filter(row => row.source_url).length;
    const histories = Object.values(compareGroups(rows)).filter(canBuildNationalLocalHistory).length;
    return '<div class="wb-grid"><div class="wb-card"><div class="wb-value">' + rows.length + '</div><p>当前筛选记录</p></div><div class="wb-card"><div class="wb-value">' + (years.length ? Math.max(...years) : "—") + '</div><p>最新可用年度</p></div><div class="wb-card"><div class="wb-value">' + Math.round(linked / Math.max(rows.length,1) * 100) + '%</div><p>原文链接覆盖率</p></div><div class="wb-card"><div class="wb-value">' + histories + '</div><p>国家-地方历史对比组</p></div></div><h3 style="margin:20px 0 8px">最近可比变化</h3><div class="wb-card wb-list">' + (list.length ? list.map(item => '<div class="wb-row"><div><b>' + h(item.last.compare_key) + '</b><small>' + h(item.last.region) + ' · ' + item.before.year + '→' + item.last.year + '</small></div><div style="text-align:right"><b style="color:' + (item.pct >= 0 ? "#0a7d52" : "#c4473d") + '">' + (item.pct >= 0 ? "+" : "") + item.pct.toFixed(1) + '%</b><small>' + h(item.last.value) + ' ' + h(item.last.unit) + '</small></div></div>').join("") : '<p>当前筛选下没有可计算的连续年度序列。</p>') + '</div><div class="wb-note">按同地区、同指标的相邻可用年度计算；跨来源与统计口径仍应以原文说明为准。</div>';
  }
  function knowledgePanel() {
    if (!knowledge) return '<div class="wb-note">从任一指标卡点击 i 可打开该指标的知识卡。</div>';
    const rows = knowledge.recs, first = rows[0] || {}, years = uniq(rows.map(row => +row.year).filter(year => year && year < 2030)).sort((a,b) => a-b), regions = uniq(rows.map(row => row.region)).sort((a,b) => a.localeCompare(b,"zh-Hans"));
    const sources = uniq(rows.filter(row => row.source_url).map(row => row.source_url)).slice(0,4);
    return '<div class="wb-grid"><div class="wb-card"><h3>指标</h3><div class="wb-value" style="font-size:18px">' + h(knowledge.key) + '</div><p>' + h(catShort(first.category || "")) + ' · ' + h(first.subcategory || "未细分") + '</p></div><div class="wb-card"><h3>统计口径</h3><p>' + h(metricFormLabel(metricForm(first))) + (first.unit ? ' · 单位 ' + h(first.unit) : "") + '<br>数据性质：' + h(first.nature || "—") + '</p></div><div class="wb-card"><h3>覆盖范围</h3><p>' + (years.length ? years[0] + '-' + years.at(-1) + ' 年' : "—") + '<br>' + regions.length + ' 个地区：' + h(regions.slice(0,5).join("、")) + (regions.length > 5 ? "等" : "") + '</p></div></div><div class="wb-card" style="margin-top:12px"><h3>来源与可比性</h3><p>同一比较卡内已按指标口径归并；年度统计公报与统计快报并列时，引用优先采用年度最终口径。</p><div style="margin-top:8px">' + (sources.length ? sources.map(url => '<a class="wb-link wb-tag" target="_blank" rel="noopener" href="' + h(url) + '">原始来源</a>').join("") : '<span>当前记录未附可打开的原文链接。</span>') + '</div></div><div class="wb-controls" style="margin-top:14px"><button class="wb-button" type="button" data-wb-add-current>加入对比篮</button><button class="wb-button light" type="button" data-wb-detail>查看明细</button></div>';
  }
  function cities() { return uniq(DATA.filter(row => row.region !== "全国" && tierNo(row.region_tier) >= 2).map(row => row.region)).sort((a,b) => a.localeCompare(b,"zh-Hans")); }
  const domains = [["卫生资源", row => catShort(row.category) === "卫生健康" && /卫生资源|床位|卫生人员/.test(row.subcategory || "")],["医疗服务", row => catShort(row.category) === "卫生健康" && /医疗服务|医院运行|医疗质量|基层卫生|中医药/.test(row.subcategory || "")],["医保保障", row => catShort(row.category) === "医疗保障"],["健康结果", row => catShort(row.category) === "卫生健康" && /健康结果|健康水平|妇幼|疾病/.test(row.subcategory || "")],["人口经济", row => ["人口","经济","财政"].includes(catShort(row.category))]];
  function score(city, test) { return new Set(DATA.filter(row => row.region === city && test(row)).map(row => row.compare_key)).size; }
  function radar(a,b) {
    const all = cities(), maxes = domains.map(domain => Math.max(...all.map(city => score(city,domain[1])),1));
    const point = (i,v) => { const angle = -Math.PI/2+i*Math.PI*2/domains.length, r = 104*v; return (160+Math.cos(angle)*r) + "," + (150+Math.sin(angle)*r); };
    const polygon = city => domains.map((domain,i) => point(i,score(city,domain[1])/maxes[i])).join(" ");
    return '<svg class="radar" viewBox="0 0 320 300"><polygon class="axis" points="' + domains.map((x,i) => point(i,1)).join(" ") + '"></polygon>' + domains.map((domain,i) => { const angle=-Math.PI/2+i*Math.PI*2/domains.length; return '<line class="axis" x1="160" y1="150" x2="' + point(i,1) + '"></line><text x="' + (160+Math.cos(angle)*130) + '" y="' + (154+Math.sin(angle)*130) + '" text-anchor="middle">' + h(domain[0]) + '</text>'; }).join("") + '<polygon class="a" points="' + polygon(a) + '"></polygon><polygon class="b" points="' + polygon(b) + '"></polygon></svg>';
  }
  function cityOutput(a,b) { return '<div class="wb-grid"><div class="wb-card">' + radar(a,b) + '</div><div class="wb-card"><h3>指标覆盖画像</h3><p><span class="wb-tag">' + h(a) + '</span><span class="wb-tag">' + h(b) + '</span></p>' + domains.map(domain => '<div class="wb-row"><span>' + h(domain[0]) + '</span><b>' + score(a,domain[1]) + ' / ' + score(b,domain[1]) + '</b></div>').join("") + '<div class="wb-note">画像反映已收录的指标口径数量，用于判断数据覆盖与可分析范围，不代表城市综合绩效。</div></div></div>'; }
  function cityPanel() { const all = cities(), a = all.includes("大连市") ? "大连市" : all[0], b = all.find(city => city !== a) || a, options = selected => all.map(city => '<option value="' + h(city) + '"' + (city === selected ? " selected" : "") + '>' + h(city) + '</option>').join(""); return '<div class="wb-controls"><select class="wb-select" id="wbCityA">' + options(a) + '</select><select class="wb-select" id="wbCityB">' + options(b) + '</select><button class="wb-button" id="wbCityApply" type="button">生成画像</button></div><div id="wbCityOutput">' + cityOutput(a,b) + '</div>'; }
  function basketPanel() { const items = readBasket(); return '<div class="wb-controls"><button class="wb-button light" type="button" data-wb-clear' + (items.length ? "" : " disabled") + '>清空对比篮</button><span>' + items.length + '/12 个指标</span></div><div class="wb-card wb-list">' + (items.length ? items.map(item => { const latest = actual(DATA.filter(row => item.keys.includes(row.compare_key))).sort((a,b) => +b.year - +a.year)[0]; return '<div class="wb-row"><div><b>' + h(item.label) + '</b><small>' + h(item.unit || "") + ' · ' + (latest ? latest.region + " " + latest.year : "暂无实际值") + '</small></div><div><b>' + (latest ? h(latest.value) : "—") + '</b> <button class="wb-button light" data-wb-remove="' + h(item.id) + '" type="button">移除</button></div></div>'; }).join("") : '<p>还没有收藏指标。可在任一指标卡点击 ☆ 加入。</p>') + '</div>'; }
  function qualityPanel() { const rows = rowsNow(), missing = rows.filter(row => !row.source_url).length, review = rows.filter(row => sourceStatus(row).cls === "review").length, ids = {}; rows.forEach(row => { const id = [row.region,row.year,row.compare_key,row.nature].join("|"); ids[id]=(ids[id]||0)+1; }); const duplicate = Object.values(ids).filter(n => n>1).reduce((sum,n) => sum+n-1,0); return '<div class="wb-grid"><div class="wb-card"><div class="wb-value">' + rows.length + '</div><p>当前范围记录</p></div><div class="wb-card"><div class="wb-value">' + missing + '</div><p>待补原文链接</p></div><div class="wb-card"><div class="wb-value">' + review + '</div><p>待复核材料记录</p></div><div class="wb-card"><div class="wb-value">' + duplicate + '</div><p>同口径同年重复</p></div></div><div class="wb-card" style="margin-top:12px"><h3>分类与可用性</h3><p>' + uniq(rows.map(row => row.category)).length + ' 个一级类别 · ' + uniq(rows.map(row => row.category + "|" + row.subcategory)).length + ' 个二级分类 · ' + uniq(rows.map(metricForm)).length + ' 种指标口径。</p><div class="wb-controls" style="margin-top:9px"><button class="wb-button light" data-wb-quality="missing" type="button">查看待补链接</button><button class="wb-button light" data-wb-quality="review" type="button">查看待复核</button></div></div>'; }
  function trendOptions() {
    const groups = {};
    actual(DATA).forEach(row => { const key = indicatorFamily(row); (groups[key] ||= []).push(row); });
    return Object.entries(groups).filter(entry => uniq(entry[1].map(row => row.year)).length >= 2).map(entry => ({ key: entry[0], rows: entry[1] })).sort((a,b) => a.key.localeCompare(b.key,"zh-Hans"));
  }
  function sourceRank(row) { const text = String(row.source || ""); return text.includes("统计公报") ? 3 : (text.includes("统计快报") ? 2 : (row.source_url ? 1 : 0)); }
  function trendSeries(option) {
    if (!option) return [];
    const selected = actual(option.rows).filter(row => String(tierNo(row.region_tier)) === trend.tier && (!trend.region || row.region === trend.region));
    const byRegion = {};
    selected.forEach(row => {
      const values = byRegion[row.region] || (byRegion[row.region] = {});
      if (!values[row.year] || sourceRank(row) > sourceRank(values[row.year])) values[row.year] = row;
    });
    const priority = region => region === "全国" ? 0 : (region === "辽宁省" ? 1 : (region === "大连市" ? 2 : 3));
    return Object.entries(byRegion).map(entry => ({ region: entry[0], rows: Object.values(entry[1]).sort((a,b) => +a.year - +b.year) })).filter(series => series.rows.length >= 2).sort((a,b) => priority(a.region)-priority(b.region) || b.rows.length-a.rows.length || a.region.localeCompare(b.region,"zh-Hans"));
  }
  function trendPanel() {
    const options = trendOptions();
    if (!options.length) return '<div class="wb-note">当前数据库中没有可生成历史趋势的指标。</div>';
    if (trend.index >= options.length) trend.index = 0;
    const series = trendSeries(options[trend.index]), regions = uniq(series.map(item => item.region));
    const metricOptions = options.map((item,index) => '<option value="' + index + '"' + (index === trend.index ? " selected" : "") + '>' + h(item.key) + '</option>').join("");
    const regionOptions = '<option value="">该层级全部地区</option>' + regions.map(region => '<option value="' + h(region) + '"' + (region === trend.region ? " selected" : "") + '>' + h(region) + '</option>').join("");
    return '<div class="wb-controls"><select class="wb-select" id="wbTrendMetric">' + metricOptions + '</select><div class="wb-levels">' + [["1","国家"],["2","省级"],["3","副省级城市"]].map(item => '<button class="wb-level' + (trend.tier === item[0] ? " on" : "") + '" type="button" data-wb-tier="' + item[0] + '">' + item[1] + '</button>').join("") + '</div><select class="wb-select" id="wbTrendRegion">' + regionOptions + '</select></div><div id="wbTrendOutput"></div>';
  }
  function trendGraph() {
    const target = host.querySelector("#wbTrendOutput"), option = trendOptions()[trend.index];
    if (!target || !option) return;
    let series = trendSeries(option);
    const total = series.length;
    series = series.slice(0,10);
    if (!series.length) { target.innerHTML = '<div class="wb-note">该指标在所选层级没有两个及以上年度的实际值。</div>'; return; }
    const years = uniq(series.flatMap(item => item.rows.map(row => +row.year))).sort((a,b) => a-b);
    const values = series.flatMap(item => item.rows.map(row => numOf(row.value)));
    let low = Math.min(...values), high = Math.max(...values);
    if (low === high) { low = low === 0 ? -1 : low * .94; high = high === 0 ? 1 : high * 1.06; }
    const pad = (high-low)*.1; low -= pad; high += pad;
    const width=760,height=270,left=52,right=12,top=16,bottom=30,minYear=years[0],maxYear=years.at(-1);
    const x = year => left + (year-minYear)/(maxYear-minYear||1)*(width-left-right);
    const y = value => top + (1-(value-low)/(high-low||1))*(height-top-bottom);
    const colors=["#1f4e79","#c4473d","#0d8a9c","#0a7d52","#b9770a","#6950a1","#e26d3f","#64748b","#c35c94","#4f7fbc"];
    let svg = '<svg class="trend-chart" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">';
    [0.16,.5,.84].forEach(ratio => { const value=low+(high-low)*ratio, py=y(value); svg += '<line x1="' + left + '" y1="' + py + '" x2="' + (width-right) + '" y2="' + py + '" stroke="#eef2f7"/><text x="' + (left-5) + '" y="' + (py+3) + '" font-size="9" fill="#8996a8" text-anchor="end">' + h(fmtNum(value)) + '</text>'; });
    years.forEach(year => { svg += '<text x="' + x(year) + '" y="' + (height-7) + '" font-size="9" fill="#8492a6" text-anchor="middle">' + year + '</text>'; });
    let legend = '', summaries = [];
    series.forEach((item,index) => {
      const color = colors[index%colors.length], points = item.rows.map(row => x(+row.year) + ',' + y(numOf(row.value))).join(" ");
      svg += '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
      item.rows.forEach(row => { svg += '<circle cx="' + x(+row.year) + '" cy="' + y(numOf(row.value)) + '" r="2.8" fill="#fff" stroke="' + color + '" stroke-width="1.8"><title>' + h(item.region + ' ' + row.year + '：' + row.value + ' ' + row.unit) + '</title></circle>'; });
      const first=item.rows[0],last=item.rows.at(-1),firstValue=numOf(first.value),lastValue=numOf(last.value),change=firstValue ? (lastValue-firstValue)/Math.abs(firstValue)*100 : 0;
      legend += '<span><i style="background:' + color + '"></i>' + h(item.region) + ' ' + first.year + '-' + last.year + '</span>';
      summaries.push('<div class="wb-row"><span>' + h(item.region) + '</span><b>' + h(first.value) + ' → ' + h(last.value) + ' ' + h(last.unit) + ' <small style="display:inline;color:' + (change >= 0 ? "#0a7d52" : "#c4473d") + '">' + (change>=0?"+":"") + change.toFixed(1) + '%</small></b></div>');
    });
    svg += '</svg>';
    target.innerHTML = '<div class="wb-card"><h3>' + h(option.key) + ' · ' + ({"1":"国家","2":"省级","3":"副省级城市"}[trend.tier]) + '历史趋势</h3>' + svg + '<div class="trend-legend">' + legend + '</div>' + (total>series.length ? '<div class="wb-note">默认展示覆盖期较长的 ' + series.length + ' 个序列；请使用地区选择查看其他地区。</div>' : '') + '</div><div class="wb-card" style="margin-top:12px"><h3>首末期变化</h3>' + summaries.join("") + '</div>';
  }
  function timeOptions() { return Object.entries(compareGroups(rowsNow())).filter(entry => { const values = actual(entry[1]); return uniq(values.map(row => row.year)).length >= 2 && uniq(values.map(row => row.region)).length >= 2; }).map(entry => ({ key:entry[0], rows:entry[1] })).slice(0,80); }
  function timelinePanel() { const options=timeOptions(); if(!options.length)return '<div class="wb-note">当前筛选下没有至少两个地区、两个年度的可播放序列。</div>'; if(timeline.index>=options.length)timeline.index=0; return '<div class="wb-controls"><select class="wb-select" id="wbTimelineMetric">' + options.map((item,i) => '<option value="' + i + '"' + (i===timeline.index ? " selected" : "") + '>' + h(item.key) + '</option>').join("") + '</select><button class="wb-button" type="button" id="wbTimelinePlay">播放</button></div><div id="wbTimelineFrame"></div>'; }
  function frame() { const target=host.querySelector("#wbTimelineFrame"), item=timeOptions()[timeline.index]; if(!target||!item)return; const rows=actual(item.rows), years=uniq(rows.map(row=>+row.year)).sort((a,b)=>a-b); if(!years.includes(timeline.year))timeline.year=years[0]; const data={}; rows.filter(row=>+row.year===timeline.year).forEach(row=>data[row.region]=row); const values=Object.values(data).sort((a,b)=>numOf(b.value)-numOf(a.value)).slice(0,10), max=Math.max(...values.map(row=>numOf(row.value)),1); target.innerHTML='<div class="wb-card"><div class="wb-controls"><input id="wbTimelineYear" type="range" min="' + years[0] + '" max="' + years.at(-1) + '" step="1" value="' + timeline.year + '"><b>' + timeline.year + '</b></div>' + values.map(row => '<div class="timeline-row"><span>' + h(row.region) + '</span><i><b style="width:' + (numOf(row.value)/max*100).toFixed(1) + '%"></b></i><b>' + h(row.value) + ' ' + h(row.unit) + '</b></div>').join("") + '</div>'; target.querySelector("#wbTimelineYear").oninput = event => { timeline.year=+event.target.value; frame(); }; }
  function updatePanel() { const agencies=["国家卫健委","国家医保局","国家统计局","财政部","地方部门"]; return '<div class="wb-grid">' + agencies.map(agency => { const rows=DATA.filter(row=>sourceAgency(row)===agency); if(!rows.length)return ""; const year=Math.max(...rows.map(row=>+row.year).filter(Boolean)), source=rows.find(row=>row.source_url); return '<div class="wb-card"><h3>' + h(agency) + '</h3><div class="wb-value">' + year + '</div><p>当前已收录最新年度</p>' + (source?'<a class="wb-link" target="_blank" rel="noopener" href="' + h(source.source_url) + '">打开最近公开源</a>':"") + '</div>'; }).join("") + '</div><div class="wb-card" style="margin-top:12px"><h3>官方来源巡检</h3><p>仓库已配置定时巡检，持续检查国家卫健委、国家医保局、国家统计局等官方页面的可访问性与内容指纹；变化进入人工复核和结构化入库流程。</p><p style="margin-top:8px"><a class="wb-link" target="_blank" rel="noopener" href="https://github.com/xujiann/health-indicators/actions/workflows/official-source-watch.yml">查看巡检记录</a></p></div>'; }
  function topicPanel() { const cat=short=>DATA.find(row=>catShort(row.category)===short)?.category||short, topics=[["卫生资源配置",cat("卫生健康"),"卫生资源"],["医疗服务能力",cat("卫生健康"),"医疗服务"],["医保基金与待遇",cat("医疗保障"),"基金收支"],["妇幼与公共卫生",cat("卫生健康"),"妇幼与公共卫生"],["健康结果",cat("卫生健康"),"健康结果"],["人口与经济基础",cat("人口"),"人口规模与结构"]]; return '<div class="wb-grid">' + topics.map(topic => '<button class="wb-card" type="button" data-wb-topic="' + encodeURIComponent(JSON.stringify({category:topic[1],sub:topic[2]})) + '" style="text-align:left;cursor:pointer"><h3>' + h(topic[0]) + '</h3><p>' + h(catShort(topic[1])) + ' · ' + h(topic[2]) + '</p></button>').join("") + '</div>'; }
  function add(id) { const item=cache.get(id); if(!item)return; const items=readBasket(); if(items.some(entry=>entry.id===id)){writeBasket(items.filter(entry=>entry.id!==id));showToast("已从对比篮移除");}else{writeBasket([...items,{id:item.id,label:item.key,keys:item.keys,unit:item.unit}]);showToast("已加入对比篮");}render(); if(active==="basket"&&host.classList.contains("open"))draw(); }
  function bind() {
    if(active==="trend"){
      host.querySelector("#wbTrendMetric").onchange=event=>{trend.index=+event.target.value;trend.region="";draw();};
      host.querySelectorAll("[data-wb-tier]").forEach(button=>button.onclick=()=>{trend.tier=button.dataset.wbTier;trend.region="";draw();});
      host.querySelector("#wbTrendRegion").onchange=event=>{trend.region=event.target.value;trendGraph();};
      trendGraph();
    }
    if(active==="cities"){host.querySelector("#wbCityApply").onclick=()=>{const a=host.querySelector("#wbCityA").value,b=host.querySelector("#wbCityB").value;host.querySelector("#wbCityOutput").innerHTML=cityOutput(a,b);};}
    if(active==="timeline"){host.querySelector("#wbTimelineMetric").onchange=event=>{timeline.index=+event.target.value;timeline.year=null;frame();};host.querySelector("#wbTimelinePlay").onclick=event=>{const button=event.currentTarget;if(timer){clearInterval(timer);timer=null;button.textContent="播放";return;}button.textContent="暂停";timer=setInterval(()=>{const years=uniq(actual(timeOptions()[timeline.index].rows).map(row=>+row.year)).sort((a,b)=>a-b),at=years.indexOf(timeline.year);timeline.year=years[(at+1)%years.length];frame();},900);};frame();}
    host.querySelectorAll("[data-wb-remove]").forEach(button=>button.onclick=()=>{writeBasket(readBasket().filter(item=>item.id!==button.dataset.wbRemove));draw();render();});
    const clear=host.querySelector("[data-wb-clear]");if(clear)clear.onclick=()=>{writeBasket([]);draw();render();};
    const detail=host.querySelector("[data-wb-detail]");if(detail)detail.onclick=()=>{close();openIndicatorDetail(knowledge.key,knowledge.recs);};
    const addCurrent=host.querySelector("[data-wb-add-current]");if(addCurrent)addCurrent.onclick=()=>{cache.set(knowledge.id,knowledge);add(knowledge.id);};
    host.querySelectorAll("[data-wb-quality]").forEach(button=>button.onclick=()=>{state.sourceState=button.dataset.wbQuality;close();syncControls();render();});
    host.querySelectorAll("[data-wb-topic]").forEach(button=>button.onclick=()=>{const topic=JSON.parse(decodeURIComponent(button.dataset.wbTopic));resetFacets();Object.assign(state,{q:"",cat:topic.category,sub:topic.sub,year:"",onlyCmp:true});close();syncControls();render();});
  }
  document.addEventListener("click",event=>{const info=event.target.closest("[data-wb-knowledge]");if(info){event.preventDefault();open("knowledge",cache.get(info.dataset.wbKnowledge));return;}const save=event.target.closest("[data-wb-save]");if(save){event.preventDefault();add(save.dataset.wbSave);}});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&host?.classList.contains("open"))close();});
  mount();render();
})();
