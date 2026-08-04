import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const registryPath = path.join(repoRoot, "docs", "official-source-registry.json");
const cityRegistryPath = path.join(repoRoot, "docs", "subprov-official-source-registry.json");
const baselinePath = path.join(repoRoot, "docs", "official-source-baseline.json");
const outputPath = path.join(repoRoot, "tmp", "official-source-watch.json");
const summaryPath = path.join(repoRoot, "tmp", "official-source-changes.md");
const updateBaseline = process.argv.includes("--update-baseline");
const strict = process.argv.includes("--strict");

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? textFromHtml(match[1]) : "";
}

const registry = [
  ...JSON.parse(await fs.readFile(registryPath, "utf8")),
  ...JSON.parse(await fs.readFile(cityRegistryPath, "utf8")),
];
const duplicateIds = registry.filter((entry, index) => registry.findIndex((candidate) => candidate.id === entry.id) !== index);
if (duplicateIds.length) throw new Error(`来源登记存在重复 id：${duplicateIds.map((entry) => entry.id).join("、")}`);
let baseline = { sources: [] };
try {
  baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const baselineById = new Map((baseline.sources || []).map((entry) => [entry.id, entry]));
const results = await Promise.all(registry.map(async (entry) => {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(entry.url, {
      headers: { "user-agent": "health-indicators-source-watch/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    const html = await response.text();
    const text = textFromHtml(html).slice(0, 12000);
    const accessRestricted = [401, 403, 406, 412, 429].includes(response.status);
    return {
      ...entry,
      checked_at: checkedAt,
      http_status: response.status,
      status: response.ok ? "available" : accessRestricted ? "restricted" : "unavailable",
      title: response.ok ? pageTitle(html) : "",
      content_sha256: response.ok ? crypto.createHash("sha256").update(text).digest("hex") : "",
      error: response.ok ? "" : `HTTP ${response.status}${accessRestricted ? " (origin access restricted)" : ""}`,
    };
  } catch (error) {
    return {
      ...entry,
      checked_at: checkedAt,
      http_status: 0,
      status: "unavailable",
      title: "",
      content_sha256: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}));

const changes = results.flatMap((current) => {
  const previous = baselineById.get(current.id);
  if (!previous) return [{ id: current.id, agency: current.agency, topic: current.topic, kind: "unbaselined", previous: "", current: current.status }];
  const itemChanges = [];
  if (previous.status !== current.status) {
    itemChanges.push({ id: current.id, agency: current.agency, topic: current.topic, kind: "status", previous: previous.status, current: current.status });
  }
  if (
    previous.status === "available"
    && current.status === "available"
    && previous.content_sha256
    && current.content_sha256
    && previous.content_sha256 !== current.content_sha256
  ) {
    itemChanges.push({ id: current.id, agency: current.agency, topic: current.topic, kind: "content", previous: previous.content_sha256, current: current.content_sha256 });
  }
  if (previous.title && current.title && previous.title !== current.title) {
    itemChanges.push({ id: current.id, agency: current.agency, topic: current.topic, kind: "title", previous: previous.title, current: current.title });
  }
  return itemChanges;
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({
  checked_at: new Date().toISOString(),
  summary: {
    checked: results.length,
    changed: changes.length,
    unavailable: results.filter((item) => item.status === "unavailable").length,
    restricted: results.filter((item) => item.status === "restricted").length,
  },
  changes,
  sources: results,
}, null, 2)}\n`);
const changeLines = changes.length
  ? changes.map((change) => `- **${change.agency}｜${change.topic}**：${change.kind} 从 \`${change.previous || "—"}\` 变为 \`${change.current || "—"}\``)
  : ["- 本次未发现相对基线的状态、标题或内容指纹变化。"];
await fs.writeFile(summaryPath, `# 官方数据源巡检差异

巡检时间：${new Date().toISOString()}

${changeLines.join("\n")}

人工复核后，可执行 \`npm run watch:update-baseline\` 接受当前状态为新基线。
`);
if (updateBaseline) {
  const nextBaseline = {
    schema_version: 1,
    sources: results.map((item) => ({
      id: item.id,
      agency: item.agency,
      topic: item.topic,
      url: item.url,
      status: item.status,
      http_status: item.http_status,
      title: item.title,
      content_sha256: item.content_sha256,
      checked_at: item.checked_at,
    })),
  };
  await fs.writeFile(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
}
const failed = results.filter((item) => item.status === "unavailable").length;
const restricted = results.filter((item) => item.status === "restricted").length;
console.log(JSON.stringify({
  output: outputPath,
  summary: summaryPath,
  checked: results.length,
  changed: changes.length,
  failed,
  restricted,
  baselineUpdated: updateBaseline,
}, null, 2));

if (strict && failed) process.exitCode = 1;
