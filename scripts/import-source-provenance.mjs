import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeProvenanceOverrides,
  parseProvenanceCsv,
  parseProvenanceJson,
  validateProvenanceRows,
} from "./lib/provenance-import.mjs";

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
  console.log("用法：node scripts/import-source-provenance.mjs <原文替换.csv|原文替换.json> [--write]");
  console.log("默认只预检；通过后加 --write 写入 data/source-provenance-overrides.json。");
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const inputs = args.filter((arg) => arg !== "--write");
  if (inputs.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--write")) {
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
  if (write && result.accepted.length) {
    await fs.writeFile(destination, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({
    input_rows: rows.length,
    accepted_rows: result.accepted.length,
    blank_backlog_rows: result.blank,
    mode: write ? "written" : "dry-run",
    destination: path.relative(repoRoot, destination),
  }, null, 2));
  if (!result.accepted.length) {
    console.log("没有可写入的完整来源替换行。");
  } else if (!write) {
    console.log("预检通过；确认原文后追加 --write 写入来源证据覆盖文件。");
  }
}

await main();
