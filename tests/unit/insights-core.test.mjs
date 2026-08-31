import assert from "node:assert/strict";
import test from "node:test";
import { buildCityMatrix, buildCityRanking, buildInsurancePairs, buildTrend, buildYearChanges } from "../../insights-core.js";

const row = (overrides) => ({ nature: "实际值", value: 1, unit: "个", compare_key: "指标", region: "甲市", year: 2024, ...overrides });

test("趋势序列按年度排序并排除非实际值与混合单位", () => {
  const rows = [row({ year: 2025, value: 12 }), row({ year: 2023, value: 8 }), row({ year: 2024, value: 99, unit: "万人" }), row({ year: 2022, nature: "目标值" })];
  assert.deepEqual(buildTrend(rows, "指标").map(({ year, value }) => [year, value]), [[2023, 8], [2025, 12]]);
});

test("城市矩阵保留缺值且排名不把缺值当作零", () => {
  const rows = [row({ region: "甲市", year: 2025, value: 10 }), row({ region: "乙市", year: 2024, value: 9 })];
  const matrix = buildCityMatrix(rows, "指标", [2024, 2025]);
  assert.equal(matrix.find((item) => item.city === "乙市").cells[1].value, null);
  assert.deepEqual(buildCityRanking(rows, "指标", 2025).map((item) => item.region), ["甲市"]);
});

test("公报变化只比较同名同单位的相邻年度", () => {
  const rows = [row({ year: 2024, value: 100, subcategory: "卫生资源" }), row({ year: 2025, value: 110, subcategory: "卫生资源" }), row({ compare_key: "另一指标", year: 2025, subcategory: "卫生资源" })];
  const changes = buildYearChanges(rows, "卫生资源");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].percent, 10);
});

test("医保快报与年度公报按基础指标、单位和年度配对", () => {
  const rows = [row({ compare_key: "参保人数（统计快报）", value: 100, year: 2025, unit: "万人" }), row({ compare_key: "参保人数（年度统计公报）", value: 102, year: 2025, unit: "万人" }), row({ compare_key: "参保人数（年度统计公报）", value: 99, year: 2024, unit: "万人" })];
  const pairs = buildInsurancePairs(rows);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].difference, 2);
  assert.equal(pairs[0].percent, 2);
});

