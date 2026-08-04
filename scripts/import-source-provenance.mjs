import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeProvenanceOverrides,
  parseProvenanceCsv,
  parseProvenanceJson,
  validateProvenanceRows,
} from "./lib/provenance-import.mjs";
import { applyFileTransaction } from "./lib/file-transaction.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repoRoot, "data", "source-provenance-overrides.json");

function recordKey(record) {
  return [
    record.region_code,
    record.year,
    record.compare_key,
    record.nature,
    record.region_tier,
  ].join("|");
}

function usage() {
  console.log("用法：node scripts/import-source-provenance.mjs <原文替换.csv|原文替换.json> [--apply|--write]");
  console.log("默认只预览；--apply 执行事务写入、重建、全量测试，任一步失败自动回滚。--write 为兼容别名。");
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
  const rows = path.extname(inputPath).toLowerCase() === ".csv"
    ? parseProvenanceCsv(text)
    : parseProvenanceJson(text);
  const script = await fs.readFile(path.join(repoRoot, "public-data.js"), "utf8");
  const match = script.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
  if (!match) throw new Error("无法解析 public-data.js");
  const published = JSON.parse(match[1]);
  const publishedByKey = new Map(published.map((record) => [recordKey(record), record]));
  const existing = JSON.parse(await fs.readFile(destination, "utf8"));
  const existingKeys = new Set(existing.overrides.map((entry) => entry.record_key));
  const result = validateProvenanceRows(rows, publishedByKey, existingKeys);
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  const next = mergeProvenanceOverrides(existing, result.accepted);
  console.log(JSON.stringify({
    input_rows: rows.length,
    accepted_rows: result.accepted.length,
    blank_backlog_rows: result.blank,
    projected_source_index_delta: -result.accepted.length,
    mode: apply ? "transaction-apply" : "preview",
    destination: path.relative(repoRoot, destination),
  }, null, 2));
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
      content: `${JSON.stringify(next, null, 2)}\n`,
      generatedPaths,
    });
    console.log(JSON.stringify({ applied: true, rolled_back: false }, null, 2));
  }
  if (!result.accepted.length) {
    console.log("没有可写入的完整来源替换行。");
  } else if (!apply) {
    console.log("预览通过；确认原文后追加 --apply 执行事务应用。");
  }
}

await main();
