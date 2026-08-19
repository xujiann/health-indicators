import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbookPath = path.join(repoRoot, "公开指标数据库.xlsx");
const dataScriptPath = path.join(repoRoot, "public-data.js");
const tmpDir = path.join(repoRoot, "tmp");
const outputDir = path.join(repoRoot, "outputs", "complete-plan-20260819");

const artifactTool = process.env.DATA_WORKSPACE_NODE_MODULES
  ? await import(pathToFileURL(createRequire(path.join(process.env.DATA_WORKSPACE_NODE_MODULES, "package.json")).resolve("@oai/artifact-tool")).href)
  : await import("@oai/artifact-tool");
const { FileBlob, SpreadsheetFile } = artifactTool;

await fs.mkdir(tmpDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheetResult = await workbook.inspect({ kind: "sheet", include: "name", maxChars: 4000 });
const sheets = sheetResult.ndjson.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const sheetNames = sheets.map((sheet) => sheet.name);
if (!sheetNames.includes("说明") || !sheetNames.includes("覆盖概览") || !sheetNames.includes("公开指标数据")) {
  throw new Error(`Unexpected worksheet set: ${sheetNames.join(", ")}`);
}

const dataSheet = workbook.worksheets.getItem("公开指标数据");
const dataValues = dataSheet.getUsedRange(true).values;
const dataScript = await fs.readFile(dataScriptPath, "utf8");
const match = dataScript.match(/^globalThis\.HEALTH_INDICATOR_DATA=(\[[\s\S]*\]);\s*$/);
if (!match) throw new Error("Data block not found in public-data.js");
const generatedRows = JSON.parse(match[1]).length;
const workbookRows = dataValues.length - 1;
if (workbookRows !== generatedRows) {
  throw new Error(`Workbook/generated-data row mismatch: ${workbookRows} vs ${generatedRows}`);
}

const errorTokens = new Set(["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"]);
const formulaErrors = dataValues.flatMap((row, rowIndex) => row
  .map((value, columnIndex) => ({ value, rowIndex, columnIndex }))
  .filter(({ value }) => errorTokens.has(String(value))));
if (formulaErrors.length) throw new Error(`Formula errors found: ${JSON.stringify(formulaErrors.slice(0, 5))}`);

for (const [sheetName, range, fileName] of [
  ["说明", "A1:A4", "workbook-notes-preview.png"],
  ["覆盖概览", "A1:B36", "workbook-coverage-preview.png"],
  ["公开指标数据", "A1:S18", "workbook-data-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(tmpDir, fileName), new Uint8Array(await preview.arrayBuffer()));
}

const verifiedOutput = path.join(outputDir, "公开指标数据库.xlsx");
await (await SpreadsheetFile.exportXlsx(workbook)).save(verifiedOutput);

console.log(JSON.stringify({
  sheets: sheetNames,
  workbookRows,
  generatedRows,
  formulaErrors: formulaErrors.length,
  verifiedOutput,
}, null, 2));
