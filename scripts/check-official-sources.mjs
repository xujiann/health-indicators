import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const registryPath = path.join(repoRoot, "docs", "official-source-registry.json");
const outputPath = path.join(repoRoot, "tmp", "official-source-watch.json");

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function pageTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? textFromHtml(match[1]) : "";
}

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
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

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ checked_at: new Date().toISOString(), sources: results }, null, 2)}\n`);
const failed = results.filter((item) => item.status === "unavailable").length;
const restricted = results.filter((item) => item.status === "restricted").length;
console.log(JSON.stringify({ output: outputPath, checked: results.length, failed, restricted }, null, 2));

if (failed) process.exitCode = 1;
