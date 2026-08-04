import { expect, test } from "@playwright/test";

test("核心页面、来源筛选与分析工作台可用", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/index.html");
  await expect(page).toHaveTitle(/指标|数据/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "分析", exact: true })).toBeVisible();

  const search = page.locator("#q");
  await search.fill("GDP");
  await expect(page.locator("#count")).toContainText("指标");
  await expect(page.locator(".card").first()).toBeVisible();
  await search.fill("");
  await expect(page.locator("#count")).not.toContainText(/^0 /);

  await page.getByRole("button", { name: "分析", exact: true }).click();
  await expect(page.locator(".workbench.open")).toBeVisible();
  await expect(page.locator(".wb-tab")).toHaveCount(9);
  await page.getByRole("button", { name: "数据质量", exact: true }).click();
  await expect(page.getByRole("button", { name: "查看非单条原文", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看非单条原文", exact: true }).click();

  await expect(page.locator(".workbench")).not.toHaveClass(/open/);
  await expect(page.locator("#fSourceState .chip.on")).toHaveText("非单条原文");
  await expect(page.locator("#count")).not.toContainText(/^0 /);
  expect(pageErrors).toEqual([]);
});

test("列表视图与公开工作簿下载入口可达", async ({ page, request }) => {
  await page.goto("/index.html");
  await page.locator(".tab[data-m='list']").click();
  await expect(page.locator("#listView")).toBeVisible();
  await expect(page.locator("#rows tr").first()).toBeVisible();

  const workbook = await request.get("/公开指标数据库.xlsx");
  expect(workbook.ok()).toBeTruthy();
  expect(workbook.headers()["content-type"]).toContain("spreadsheetml");

  const generatedData = await request.get("/public-data.js");
  expect(generatedData.ok()).toBeTruthy();
  expect(await generatedData.text()).toContain("HEALTH_INDICATOR_DATA");
});

test("专题链接可恢复筛选状态并导出当前数据", async ({ page }) => {
  await page.goto("/index.html#p=insurance");
  await expect(page.locator("#fCat .chip.on")).toContainText("医疗保障");
  await expect(page.locator("#fTier .chip.on")).toHaveCount(1);
  await expect(page.locator("#count")).not.toContainText(/^0 /);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/health-indicators-view-.*\.csv$/);
});

test("键盘可切换视图并关闭分析对话框", async ({ page }) => {
  await page.goto("/index.html");
  const listTab = page.getByRole("button", { name: "明细列表", exact: true });
  await listTab.focus();
  await page.keyboard.press("Enter");
  await expect(listTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#listView")).toBeVisible();

  await page.getByRole("button", { name: "分析", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "数据分析工作台" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workbench")).not.toHaveClass(/open/);
});

test("移动端核心控件不产生水平溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");
  await expect(page.getByLabel("搜索指标")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBeFalsy();
});

test("覆盖维护页可筛选缺口并下载标准台账", async ({ page, request }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/coverage.html");
  await expect(page).toHaveTitle(/数据覆盖维护/);
  await expect(page.locator("tbody tr")).toHaveCount(15);
  const coverage = await request.get("/data/coverage-report.json");
  expect(coverage.ok()).toBeTruthy();
  const report = await coverage.json();
  await expect(page.locator("#gapKpi")).toHaveText(String(report.summary.matrix_gaps));

  await page.locator("#cityFilter").selectOption("大连市");
  await expect(page.locator("#gapCount")).toContainText("当前筛选");
  await expect(page.locator("#gapList .gap").first()).toContainText("大连市");

  const backlog = await request.get("/data/subprov-core-matrix-backlog.csv");
  expect(backlog.ok()).toBeTruthy();
  expect(await backlog.text()).toContain("metric_key");
  const provenanceBacklog = await request.get("/data/source-index-backlog.csv");
  expect(provenanceBacklog.ok()).toBeTruthy();
  expect(await provenanceBacklog.text()).toContain("record_key");
  expect(pageErrors).toEqual([]);
});
