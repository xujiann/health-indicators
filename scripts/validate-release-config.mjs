import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const coverageHtml = fs.readFileSync(path.join(repoRoot, "coverage.html"), "utf8");
const cityAnalysisHtml = fs.readFileSync(path.join(repoRoot, "city-analysis.html"), "utf8");
const cityAnalysisScript = fs.readFileSync(path.join(repoRoot, "city-analysis.js"), "utf8");
const pages = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "pages.yml"), "utf8");
const taskSync = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "subprov-task-sync.yml"), "utf8");
const rollback = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "rollback-pages.yml"), "utf8");
const sourceWatch = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "official-source-watch.yml"), "utf8");
const sourceRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "official-source-registry.json"), "utf8"));
const citySourceRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "subprov-official-source-registry.json"), "utf8"));
const sourceBaseline = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "official-source-baseline.json"), "utf8"));
const registryIds = [...sourceRegistry, ...citySourceRegistry].map((entry) => entry.id).sort();
const baselineIds = sourceBaseline.sources.map((entry) => entry.id).sort();
const cityChannelKeys = new Set(citySourceRegistry.map((entry) => `${entry.region_code}|${entry.channel}`));

const checks = [
  ["主页加载生成数据脚本", /<script\s+src=["']public-data\.js["']><\/script>/.test(html)],
  ["主页加载核心逻辑脚本", /<script\s+src=["']app-core\.js["']><\/script>/.test(html)],
  ["主页加载分析工作台脚本", /<script\s+src=["']analysis-workbench\.js["']><\/script>/.test(html)],
  ["Pages 制品复制生成数据脚本", /cp\s+public-data\.js\s+_site\//.test(pages)],
  ["Pages 制品复制核心逻辑脚本", /cp\s+app-core\.js\s+_site\//.test(pages)],
  ["Pages 制品复制分析工作台脚本", /cp\s+analysis-workbench\.js\s+_site\//.test(pages)],
  ["Pages 制品复制覆盖维护页", /cp\s+coverage\.html\s+_site\//.test(pages)],
  ["Pages 制品复制城市分析页", /cp\s+city-analysis\.html\s+_site\//.test(pages) && /cp\s+city-analysis\.js\s+_site\//.test(pages)],
  ["城市分析页按需加载副省级主题包", /data\/packs\/subprov-core\.json/.test(cityAnalysisScript)],
  ["城市分析页提供三类导出", /exportSvg/.test(cityAnalysisHtml) && /exportCsv/.test(cityAnalysisHtml) && /exportSummary/.test(cityAnalysisHtml)],
  ["覆盖维护页提供标准补录台账", /data\/subprov-core-matrix-backlog\.csv/.test(coverageHtml)],
  ["覆盖维护页提供来源原文替换台账", /data\/source-index-backlog\.csv/.test(coverageHtml)],
  ["城市来源登记覆盖 15 城 × 3 渠道", citySourceRegistry.length === 45 && cityChannelKeys.size === 45],
  ["覆盖维护页提供任务批次台账", /data\/subprov-task-batches\.json/.test(coverageHtml)],
  ["覆盖维护页展示近期核心完整率", /id="recentKpi"/.test(coverageHtml)],
  ["覆盖维护页说明任务状态命令", /npm run task:status/.test(coverageHtml)],
  ["Pages 部署依赖质量门禁", /deploy:\s*\r?\n\s+needs:\s*quality/.test(pages)],
  ["Pull Request 触发质量门禁", /pull_request:\s*\r?\n\s+branches:\s*\[main\]/.test(pages)],
  ["Pull Request 不执行生产部署", /if:\s*github\.event_name\s*!=\s*['"]pull_request['"]/.test(pages)],
  ["质量门禁运行完整测试", /run:\s*npm test/.test(pages)],
  ["来源巡检基线覆盖全部登记来源", JSON.stringify(registryIds) === JSON.stringify(baselineIds)],
  ["来源巡检具备 Issue 写权限", /issues:\s*write/.test(sourceWatch)],
  ["来源巡检仅对可行动变化创建 Issue", /summary\.actionable_changed/.test(sourceWatch)],
  ["来源变化进入复核 Issue", /gh issue (?:create|comment)/.test(sourceWatch)],
  ["任务批次同步具备 Issue 写权限", /issues:\s*write/.test(taskSync)],
  ["任务批次同步调用可写模式", /npm run tasks:issues:apply/.test(taskSync)],
  ["回滚工作流要求指定 ref 并先通过测试", /ref:\s*\$\{\{ inputs\.ref \}\}/.test(rollback) && /run:\s*npm test/.test(rollback)],
  ["Pages 发布版本与变更日志", /cp\s+CHANGELOG\.md\s+_site\//.test(pages) && fs.existsSync(path.join(repoRoot, "data", "release.json"))],
  ["主题数据包清单纳入发布制品", fs.existsSync(path.join(repoRoot, "data", "packs", "manifest.json")) && /cp -R data _site\/data/.test(pages)],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  checks: checks.length,
  passed: checks.length - failed.length,
  failed,
}, null, 2));
if (failed.length) process.exitCode = 1;
