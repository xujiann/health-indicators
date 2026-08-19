import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildIssuePlan } from "./lib/task-issue-sync.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const payload = JSON.parse(await fs.readFile(path.join(root, "data", "subprov-task-batches.json"), "utf8"));
let issues = [];
try {
  const result = await run("gh", ["issue", "list", "--state", "all", "--limit", "200", "--json", "number,title,body,state"], { cwd: root, maxBuffer: 10_000_000 });
  issues = JSON.parse(result.stdout);
} catch (error) {
  if (apply) throw error;
}
const plan = buildIssuePlan(payload.tasks, issues);
console.log(JSON.stringify({ apply, summary: Object.fromEntries(["create", "update", "reopen", "close", "noop", "skip"].map((action) => [action, plan.filter((item) => item.action === action).length])) }, null, 2));
if (!apply) process.exit(0);
for (const item of plan) {
  if (item.action === "create") await run("gh", ["issue", "create", "--title", item.title, "--body", item.body, "--label", "data-task"], { cwd: root });
  if (item.action === "update") await run("gh", ["issue", "edit", String(item.issue.number), "--title", item.title, "--body", item.body], { cwd: root });
  if (item.action === "reopen") {
    await run("gh", ["issue", "reopen", String(item.issue.number), "--comment", "该批次重新出现在当前缺口清单中，自动重新打开。"], { cwd: root });
    await run("gh", ["issue", "edit", String(item.issue.number), "--title", item.title, "--body", item.body], { cwd: root });
  }
  if (item.action === "close") await run("gh", ["issue", "close", String(item.issue.number), "--comment", "对应任务批次已完成导入，自动关闭。"], { cwd: root });
}
