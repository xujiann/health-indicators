import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbookPath = path.join(repoRoot, "公开指标数据库.xlsx");
const htmlPath = path.join(repoRoot, "index.html");
const tmpDir = path.join(repoRoot, "tmp");
const outputDir = path.join(repoRoot, "outputs", "closeout-20260803");

await fs.mkdir(tmpDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheetResult = await workbook.inspect({ kind: "sheet", include: "name", maxChars: 4000 });
const sheets = sheetResult.ndjson.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const sheetNames = sheets.map((sheet) => sheet.name);
if (!sheetNames.includes("说明") || !sheetNames.includes("公开指标数据")) {
  throw new Error(`Unexpected worksheet set: ${sheetNames.join(", ")}`);
}

const dataSheet = workbook.worksheets.getItem("公开指标数据");
const dataValues = dataSheet.getUsedRange(true).values;
const html = await fs.readFile(htmlPath, "utf8");
const match = html.match(/const DATA=(\[[\s\S]*?\]);\r?\n/);
if (!match) throw new Error("DATA block not found in index.html");
const htmlRows = JSON.parse(match[1]).length;
const workbookRows = dataValues.length - 1;
if (workbookRows !== htmlRows) {
  throw new Error(`Workbook/HTML row mismatch: ${workbookRows} vs ${htmlRows}`);
}

const errorTokens = new Set(["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"]);
const formulaErrors = dataValues.flatMap((row, rowIndex) => row
  .map((value, columnIndex) => ({ value, rowIndex, columnIndex }))
  .filter(({ value }) => errorTokens.has(String(value))));
if (formulaErrors.length) throw new Error(`Formula errors found: ${JSON.stringify(formulaErrors.slice(0, 5))}`);

for (const [sheetName, range, fileName] of [
  ["说明", "A1:A4", "workbook-notes-preview.png"],
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
  htmlRows,
  formulaErrors: formulaErrors.length,
  verifiedOutput,
}, null, 2));
