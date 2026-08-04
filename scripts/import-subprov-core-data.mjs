import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeIntoPayload,
  parseIntakeCsv,
  parseIntakeJson,
  validateIntakeRows,
} from "./lib/subprov-core-import.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repoRoot, "data", "subprov-core-matrix-additions.json");

function usage() {
  console.log("用法：node scripts/import-subprov-core-data.mjs <补录.csv|补录.json> [--write]");
  console.log("默认只预检；通过后加 --write 写入 data/subprov-core-matrix-additions.json。");
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
  const write = args.includes("--write");
  const inputs = args.filter((arg) => arg !== "--write");
  if (inputs.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--write")) {
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
  if (write && result.accepted.length) {
    await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({
    input_rows: rows.length,
    accepted_rows: result.accepted.length,
    blank_backlog_rows: result.blank,
    mode: write ? "written" : "dry-run",
    destination: path.relative(repoRoot, destination),
  }, null, 2));
  if (!result.accepted.length) {
    console.log("没有可写入的完整补录行。");
  } else if (!write) {
    console.log("预检通过；确认后追加 --write 写入事实源。");
  }
}

await main();
