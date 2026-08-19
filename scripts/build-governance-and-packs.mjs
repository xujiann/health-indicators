import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRecords } from "./lib/data-governance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const script = await fs.readFile(path.join(root, "public-data.js"), "utf8");
const match = script.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
if (!match) throw new Error("无法解析 public-data.js");
const records = JSON.parse(match[1]);
const release = JSON.parse(await fs.readFile(path.join(root, "data", "release.json"), "utf8"));
const collectedAt = release.dataset_collected_at || release.released_at || release.released_on;
const analysis = analyzeRecords(records, { collectedAt });
const manifest = JSON.parse(await fs.readFile(path.join(root, "data", "public-data-manifest.json"), "utf8"));
const quality = {
  schema_version: 1,
  dataset_sha256: manifest.sha256,
  generated_at: collectedAt,
  summary: {
    rows: records.length,
    schema_errors: analysis.schemaErrors.length,
    anomalies: analysis.anomalies.length,
    conflicts: analysis.conflicts.length,
    source_complete: records.filter((row) => row.source_url && row.source && row.responsible && row.unit).length,
    average_evidence_score: Number((analysis.evidence.reduce((sum, item) => sum + item.score, 0) / records.length).toFixed(1)),
  },
  schema_errors: analysis.schemaErrors,
  anomalies: analysis.anomalies,
  conflicts: analysis.conflicts,
  evidence: analysis.evidence,
};
const packDefs = {
  "subprov-core": (row) => String(row.region_tier).startsWith("3") && ["经济", "人口", "财政"].includes(String(row.category).replace(/^\d+·/, "")),
  "national-health": (row) => row.region === "全国" && String(row.category).includes("卫生健康"),
  "medical-insurance": (row) => String(row.category).includes("医疗保障"),
};
const packManifest = { schema_version: 1, dataset_sha256: manifest.sha256, generated_at: collectedAt, packs: {} };

async function write(relative, content) {
  const target = path.join(root, relative);
  let current = "";
  try { current = await fs.readFile(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (current === content) return;
  if (check) throw new Error(`Generated file is stale: ${relative}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

for (const [name, predicate] of Object.entries(packDefs)) {
  const rows = records.filter(predicate);
  const body = `${JSON.stringify({ schema_version: 1, name, rows })}\n`;
  packManifest.packs[name] = { path: `data/packs/${name}.json`, rows: rows.length, bytes: Buffer.byteLength(body), sha256: crypto.createHash("sha256").update(body).digest("hex") };
  await write(`data/packs/${name}.json`, body);
}
await write("data/packs/manifest.json", `${JSON.stringify(packManifest, null, 2)}\n`);
await write("data/data-quality-report.json", `${JSON.stringify(quality, null, 2)}\n`);
await write("docs/数据质量报告.md", `# 数据质量报告\n\n本报告由构建链路确定性生成，证据台账采集核验时间为 ${collectedAt}。\n\n- 记录：${quality.summary.rows} 条\n- Schema 错误：${quality.summary.schema_errors} 条\n- 异常：${quality.summary.anomalies} 条\n- 跨来源冲突：${quality.summary.conflicts} 组\n- 来源、责任单位和单位完整：${quality.summary.source_complete}/${quality.summary.rows}\n- 平均证据评分：${quality.summary.average_evidence_score}/100\n- 逐条证据：包含来源 URL、采集核验时间与内容 SHA-256\n\n详细逐条结果见 \`data/data-quality-report.json\`。\n`);
console.log(JSON.stringify({ quality: quality.summary, packs: packManifest.packs }, null, 2));
