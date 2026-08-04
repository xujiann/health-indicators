import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeIntoPayload,
  parseIntakeCsv,
  parseIntakeJson,
  validateIntakeRows,
} from "./lib/subprov-core-import.mjs";
import { applyFileTransaction } from "./lib/file-transaction.mjs";
import { summarizeBatchImpact } from "./lib/subprov-task-batches.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repoRoot, "data", "subprov-core-matrix-additions.json");

function usage() {
  console.log("用法：node scripts/import-subprov-core-data.mjs <补录.csv|补录.json> [--apply|--write]");
  console.log("默认只预览；--apply 执行事务写入、重建、全量测试，任一步失败自动回滚。--write 为兼容别名。");
}

async function readPublishedIds() {
  const script = await fs.readFile(path.join(repoRoot, "public-data.js"), "utf8");
  const match = script.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
  if (!match) throw new Error("无法解析 public-data.js");
  return new Set(JSON.parse(match[1]).map((record) => (
    `${record.region}|${record.year}|${record.compare_key}`
  )));
}

async function readExisting() {
  try {
    return JSON.parse(await fs.readFile(destination, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply") || args.includes("--write");
  const inputs = args.filter((arg) => !["--apply", "--write"].includes(arg));
  if (inputs.length !== 1 || args.some((arg) => arg.startsWith("--") && !["--apply", "--write"].includes(arg))) {
    usage();
    process.exitCode = 1;
    return;
  }
  const inputPath = path.resolve(process.cwd(), inputs[0]);
  const text = await fs.readFile(inputPath, "utf8");
  const ext = path.extname(inputPath).toLowerCase();
  const rows = ext === ".csv" ? parseIntakeCsv(text) : parseIntakeJson(text);
  const result = validateIntakeRows(rows, await readPublishedIds());
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  const payload = mergeIntoPayload(await readExisting(), result.accepted);
  let taskBatches = [];
  try {
    const coverage = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "coverage-report.json"), "utf8"));
    taskBatches = summarizeBatchImpact(result.accepted, coverage.task_batches || []);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const preview = {
    input_rows: rows.length,
    accepted_rows: result.accepted.length,
    blank_backlog_rows: result.blank,
    projected_matrix_delta: result.accepted.length,
    impacted_task_batches: taskBatches,
    mode: apply ? "transaction-apply" : "preview",
    destination: path.relative(repoRoot, destination),
  };
  console.log(JSON.stringify(preview, null, 2));
  if (apply && result.accepted.length) {
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
      destination,
      content: `${JSON.stringify(payload, null, 2)}\n`,
      generatedPaths,
    });
    console.log(JSON.stringify({ applied: true, rolled_back: false }, null, 2));
  }
  if (!result.accepted.length) {
    console.log("没有可写入的完整补录行。");
  } else if (!apply) {
    console.log("预览通过；追加 --apply 可执行事务应用。");
  }
}

await main();
