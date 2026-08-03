import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const pages = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "pages.yml"), "utf8");

const checks = [
  ["主页加载分析工作台脚本", /<script\s+src=["']analysis-workbench\.js["']><\/script>/.test(html)],
  ["Pages 制品复制分析工作台脚本", /cp\s+analysis-workbench\.js\s+_site\//.test(pages)],
  ["Pages 部署依赖质量门禁", /deploy:\s*\r?\n\s+needs:\s*quality/.test(pages)],
  ["质量门禁运行完整测试", /run:\s*npm test/.test(pages)],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  checks: checks.length,
  passed: checks.length - failed.length,
  failed,
}, null, 2));
if (failed.length) process.exitCode = 1;
