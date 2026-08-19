import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyFileTransaction } from "./lib/file-transaction.mjs";
import { updateTaskStatusPayload } from "./lib/subprov-task-batches.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = path.join(repoRoot, "data", "subprov-task-status.json");
const batchesPath = path.join(repoRoot, "data", "subprov-task-batches.json");

function usage() {
  console.log("用法：node scripts/update-subprov-task-status.mjs <任务ID> <pending|found|reviewed|imported> [--assignee=姓名] [--note=备注] [--force] [--apply]");
  console.log("默认只预览；--apply 事务写入状态、重建维护页并执行全量测试。状态默认只能逐级前进。");
}

function option(args, name) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

async function main() {
  const args = process.argv.slice(2);
  const allowedFlags = ["--force", "--apply"];
  const options = args.filter((arg) => arg.startsWith("--"));
  const unknown = options.filter((arg) => (
    !allowedFlags.includes(arg)
    && !arg.startsWith("--assignee=")
    && !arg.startsWith("--note=")
  ));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (unknown.length || positional.length !== 2) {
    usage();
    process.exitCode = 1;
    return;
  }

  const [taskId, status] = positional;
  const apply = args.includes("--apply");
  const current = JSON.parse(await fs.readFile(statusPath, "utf8"));
  const batchPayload = JSON.parse(await fs.readFile(batchesPath, "utf8"));
  const result = updateTaskStatusPayload(current, batchPayload.tasks || batchPayload, {
    taskId,
    status,
    assignee: option(args, "assignee"),
    note: option(args, "note"),
    force: args.includes("--force"),
  });
  console.log(JSON.stringify({
    ...result.change,
    mode: apply ? "transaction-apply" : "preview",
    destination: path.relative(repoRoot, statusPath),
  }, null, 2));

  if (!apply) {
    console.log("预览通过；追加 --apply 可事务应用任务状态。");
    return;
  }

  const generatedPaths = [
    "public-data.js",
    "data/public-data-manifest.json",
    "data/coverage-report.json",
    "data/subprov-core-matrix-backlog.csv",
    "data/source-index-backlog.csv",
    "data/subprov-task-batches.json",
    "docs/数据覆盖率报告.md",
    "coverage.html",
  ].map((relative) => path.join(repoRoot, relative));
  await applyFileTransaction({
    repoRoot,
    destination: statusPath,
    content: `${JSON.stringify(result.payload, null, 2)}\n`,
    generatedPaths,
  });
  console.log(JSON.stringify({ applied: true, rolled_back: false }, null, 2));
}

await main();
