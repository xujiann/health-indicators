import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const coverageHtml = fs.readFileSync(path.join(repoRoot, "coverage.html"), "utf8");
const pages = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "pages.yml"), "utf8");
const sourceWatch = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "official-source-watch.yml"), "utf8");
const sourceRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "official-source-registry.json"), "utf8"));
const sourceBaseline = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "official-source-baseline.json"), "utf8"));
const registryIds = sourceRegistry.map((entry) => entry.id).sort();
const baselineIds = sourceBaseline.sources.map((entry) => entry.id).sort();

const checks = [
  ["主页加载生成数据脚本", /<script\s+src=["']public-data\.js["']><\/script>/.test(html)],
  ["主页加载核心逻辑脚本", /<script\s+src=["']app-core\.js["']><\/script>/.test(html)],
  ["主页加载分析工作台脚本", /<script\s+src=["']analysis-workbench\.js["']><\/script>/.test(html)],
  ["Pages 制品复制生成数据脚本", /cp\s+public-data\.js\s+_site\//.test(pages)],
  ["Pages 制品复制核心逻辑脚本", /cp\s+app-core\.js\s+_site\//.test(pages)],
  ["Pages 制品复制分析工作台脚本", /cp\s+analysis-workbench\.js\s+_site\//.test(pages)],
  ["Pages 制品复制覆盖维护页", /cp\s+coverage\.html\s+_site\//.test(pages)],
  ["覆盖维护页提供标准补录台账", /data\/subprov-core-matrix-backlog\.csv/.test(coverageHtml)],
  ["覆盖维护页提供来源原文替换台账", /data\/source-index-backlog\.csv/.test(coverageHtml)],
  ["Pages 部署依赖质量门禁", /deploy:\s*\r?\n\s+needs:\s*quality/.test(pages)],
  ["Pull Request 触发质量门禁", /pull_request:\s*\r?\n\s+branches:\s*\[main\]/.test(pages)],
  ["Pull Request 不执行生产部署", /if:\s*github\.event_name\s*!=\s*['"]pull_request['"]/.test(pages)],
  ["质量门禁运行完整测试", /run:\s*npm test/.test(pages)],
  ["来源巡检基线覆盖全部登记来源", JSON.stringify(registryIds) === JSON.stringify(baselineIds)],
  ["来源巡检具备 Issue 写权限", /issues:\s*write/.test(sourceWatch)],
  ["来源变化进入复核 Issue", /gh issue (?:create|comment)/.test(sourceWatch)],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  checks: checks.length,
  passed: checks.length - failed.length,
  failed,
}, null, 2));
if (failed.length) process.exitCode = 1;
